// com.miwoli.system.clock - Main R3K3: "16:22", weekday, date (Value template, design clock 26 px).
// One setImage per minute (each setImage writes the profile), aligned to the minute, only while visible.

import { type ActionHandler, type OpenActionClient, type ValueTileSpec, tileImage } from '@miwoli/deck-core';

export const ACTION = 'com.miwoli.system.clock';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function clockTile(now: Date): ValueTileSpec {
  const p = (n: number): string => String(n).padStart(2, '0');
  return {
    template: 'value',
    value: `${p(now.getHours())}:${p(now.getMinutes())}`,
    valueSize: 26,
    valueY: 33,
    name: WEEKDAYS[now.getDay()] ?? '',
    status: `${p(now.getDate())}.${p(now.getMonth() + 1)}.${now.getFullYear()}`,
  };
}

export function clockAction({ client }: { client: OpenActionClient }): ActionHandler & { dispose(): void } {
  let timer: NodeJS.Timeout | null = null;

  const drawAll = (): void => {
    const image = tileImage(clockTile(new Date()));
    for (const v of client.visibleInstances(ACTION)) client.setImage(v.context, image);
  };
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (client.visibleInstances(ACTION).length === 0) return;
    const now = new Date();
    const msToNextMinute = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50;
    timer = setTimeout(() => {
      drawAll();
      schedule();
    }, msToNextMinute);
  };

  return {
    uuid: ACTION,
    willAppear: (ev) => {
      client.setImage(ev.context, tileImage(clockTile(new Date())));
      schedule();
    },
    willDisappear: () => schedule(),
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
