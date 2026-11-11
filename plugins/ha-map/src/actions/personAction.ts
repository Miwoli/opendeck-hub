// "Person (distance)" action: a key showing the distance of the selected person
// from home (zone.home) and their current place.
// Refreshed by Home Assistant events (push), only for visible keys.

import type { PluginConnection } from '../connection.js';
import { ACTION_PERSON } from '../constants.js';
import type { AvatarCache } from '../ha/avatars.js';
import type { HaClient } from '../ha/haClient.js';
import type { HaStore } from '../ha/store.js';
import { setImage } from '../protocol.js';
import { renderTile } from '@miwoli/deck-core';
import { personTile } from '../personTile.js';
import { svgToDataUri } from '../render.js';
import { normalizePersonSettings, type PersonSettings } from '../settings.js';
import { createScheduler } from '../util.js';

const RERENDER_GAP_MS = 800;

export class PersonAction {
  private readonly contexts = new Map<string, PersonSettings>();
  private readonly lastImage = new Map<string, string>();
  private readonly scheduler = createScheduler(() => this.renderAll());

  constructor(
    private readonly connection: PluginConnection,
    private readonly store: HaStore,
    private readonly ha: HaClient,
    private readonly avatars: AvatarCache,
  ) {
    store.on('change', () => this.scheduler.schedule(RERENDER_GAP_MS));
    ha.on('status', () => this.scheduler.schedule(RERENDER_GAP_MS));
  }

  matches(actionUuid: string): boolean {
    return actionUuid === ACTION_PERSON;
  }

  get size(): number {
    return this.contexts.size;
  }

  handleWillAppear(context: string, rawSettings: unknown): void {
    this.contexts.set(context, normalizePersonSettings(rawSettings));
    this.lastImage.delete(context);
    this.renderContext(context);
  }

  handleWillDisappear(context: string): void {
    this.contexts.delete(context);
    this.lastImage.delete(context);
  }

  handleSettings(context: string, rawSettings: unknown): void {
    if (!this.contexts.has(context)) return;
    this.contexts.set(context, normalizePersonSettings(rawSettings));
    this.renderContext(context);
  }

  handleKeyUp(context: string): void {
    this.lastImage.delete(context);
    this.ha.requestSync();
    this.renderContext(context);
  }

  refresh(): void {
    this.scheduler.schedule(0);
  }

  dispose(): void {
    this.scheduler.cancel();
  }

  private renderAll(): void {
    for (const context of this.contexts.keys()) this.renderContext(context);
  }

  private renderContext(context: string): void {
    const settings = this.contexts.get(context);
    if (!settings) return;
    const image = svgToDataUri(this.buildSvg(settings));
    if (this.lastImage.get(context) === image) return;
    this.lastImage.set(context, image);
    this.connection.send(setImage(context, image));
  }

  private buildSvg(settings: PersonSettings): string {
    return renderTile(
      personTile({
        settings,
        person: this.store.persons.get(settings.entityId),
        home: this.store.home(),
        avatar: settings.showAvatar ? this.avatars.get(this.store.persons.get(settings.entityId)?.picture ?? null) : null,
        status: this.ha.status,
      }),
    );
  }
}
