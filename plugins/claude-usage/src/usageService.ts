// Shared /usage polling service used by both actions (session,
// weekly) - one HTTP request yields the data for both limits. A short
// cache (TTL) prevents duplicate requests when both keys
// refresh in the same cycle; `force` (long press) bypasses
// the cache. Subscribers (onUpdate) are notified of every fresh
// response so the other key also redraws without waiting for
// its own cycle.

import { fetchUsage, resolveOrgId, UsageError, type ClaudeUsageResponse } from './claudeUsageClient.ts';

export interface UsageServiceState {
  sessionKey: string | undefined;
  orgId: string | undefined;
}

export type OrgIdListener = (orgId: string) => void;
export type UpdateListener = (data: ClaudeUsageResponse) => void;

const CACHE_TTL_MS = 20_000;

export class UsageService {
  private cachedResponse: ClaudeUsageResponse | null = null;
  private cachedAt = 0;
  private inFlight: Promise<ClaudeUsageResponse> | null = null;
  private orgIdListeners: OrgIdListener[] = [];
  private updateListeners: UpdateListener[] = [];

  onOrgIdResolved(listener: OrgIdListener): void {
    this.orgIdListeners.push(listener);
  }

  onUpdate(listener: UpdateListener): void {
    this.updateListeners.push(listener);
  }

  invalidate(): void {
    this.cachedResponse = null;
    this.cachedAt = 0;
  }

  async getUsage(state: UsageServiceState, force: boolean): Promise<ClaudeUsageResponse> {
    if (!state.sessionKey) {
      throw new UsageError('auth', 'No sessionKey configured in the plugin settings.');
    }
    const now = Date.now();
    if (!force && this.cachedResponse && now - this.cachedAt < CACHE_TTL_MS) {
      return this.cachedResponse;
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.fetchFresh(state);
    try {
      const result = await this.inFlight;
      this.cachedResponse = result;
      this.cachedAt = Date.now();
      for (const listener of this.updateListeners) listener(result);
      return result;
    } finally {
      this.inFlight = null;
    }
  }

  private async fetchFresh(state: UsageServiceState): Promise<ClaudeUsageResponse> {
    const sessionKey = state.sessionKey;
    if (!sessionKey) {
      throw new UsageError('auth', 'No sessionKey configured in the plugin settings.');
    }
    let orgId = state.orgId;
    if (!orgId) {
      orgId = await resolveOrgId(sessionKey);
      for (const listener of this.orgIdListeners) listener(orgId);
    }
    try {
      return await fetchUsage(sessionKey, orgId);
    } catch (err) {
      if (err instanceof UsageError && err.kind === 'auth') {
        // the orgId may be stale (e.g. the account changed) - retry
        // once more with a re-detected orgId before treating it as a
        // real authorization error.
        const freshOrgId = await resolveOrgId(sessionKey);
        for (const listener of this.orgIdListeners) listener(freshOrgId);
        return await fetchUsage(sessionKey, freshOrgId);
      }
      throw err;
    }
  }
}
