// Client of the unofficial, internal claude.ai API used by
// the claude.ai web app to show the usage bar. Confirmed
// (September 2026) independently by two community projects
// (linuxlewis/claude-usage, steipete/CodexBar) and reverse-engineered
// clients (e.g. KoushikNavuluri/Claude-API for the "uuid" field in
// /api/organizations). This is NOT an official, documented API -
// the response shape may change without notice.

export interface UsageWindow {
  utilization: number;
  resets_at: string | null;
}

export interface ClaudeUsageResponse {
  five_hour?: UsageWindow;
  seven_day?: UsageWindow;
}

function parseWindow(raw: unknown): UsageWindow | undefined {
  if (typeof raw !== 'object' || raw === null || !('utilization' in raw)) return undefined;
  const utilization = raw.utilization;
  if (typeof utilization !== 'number' || !Number.isFinite(utilization)) return undefined;
  const resets = 'resets_at' in raw ? raw.resets_at : null;
  return { utilization, resets_at: typeof resets === 'string' ? resets : null };
}

export type UsageErrorKind = 'auth' | 'network' | 'unexpected';

export class UsageError extends Error {
  public readonly kind: UsageErrorKind;
  public override readonly cause?: unknown;

  constructor(kind: UsageErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'UsageError';
    this.kind = kind;
    this.cause = cause;
  }
}

// overridable only so the e2e test can point the plugin at a local fake server
const API_BASE = (process.env['OPENDECK_CLAUDE_API_BASE'] || 'https://claude.ai').replace(/\/+$/, '');
const ORGANIZATIONS_URL = `${API_BASE}/api/organizations`;

function usageUrl(orgId: string): string {
  return `${API_BASE}/api/organizations/${encodeURIComponent(orgId)}/usage`;
}

function authHeaders(sessionKey: string): Record<string, string> {
  return {
    Cookie: `sessionKey=${sessionKey}`,
    Accept: 'application/json',
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  };
}

async function getJson(url: string, sessionKey: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: authHeaders(sessionKey) });
  } catch (err) {
    throw new UsageError('network', 'Could not connect to claude.ai', err);
  }
  if (response.status === 401 || response.status === 403) {
    throw new UsageError('auth', `Authorization rejected by claude.ai (HTTP ${response.status})`);
  }
  if (!response.ok) {
    throw new UsageError('unexpected', `Unexpected claude.ai response (HTTP ${response.status})`);
  }
  try {
    return await response.json();
  } catch (err) {
    throw new UsageError('unexpected', 'Could not parse the claude.ai response as JSON', err);
  }
}

export async function resolveOrgId(sessionKey: string): Promise<string> {
  const body = await getJson(ORGANIZATIONS_URL, sessionKey);
  if (!Array.isArray(body) || body.length === 0) {
    throw new UsageError('unexpected', 'The /api/organizations response is not a non-empty array');
  }
  const first: unknown = body[0];
  const uuid = typeof first === 'object' && first !== null && 'uuid' in first ? first.uuid : undefined;
  if (typeof uuid !== 'string' || uuid.length === 0) {
    throw new UsageError('unexpected', 'Missing "uuid" field in the /api/organizations response');
  }
  return uuid;
}

export async function fetchUsage(sessionKey: string, orgId: string): Promise<ClaudeUsageResponse> {
  const body = await getJson(usageUrl(orgId), sessionKey);
  if (typeof body !== 'object' || body === null) {
    throw new UsageError('unexpected', 'The /usage response is not a JSON object');
  }
  const result: ClaudeUsageResponse = {};
  const five = parseWindow('five_hour' in body ? body.five_hour : undefined);
  const seven = parseWindow('seven_day' in body ? body.seven_day : undefined);
  if (five) result.five_hour = five;
  if (seven) result.seven_day = seven;
  if (!five && !seven) throw new UsageError('unexpected', 'The /usage response has neither five_hour nor seven_day');
  return result;
}
