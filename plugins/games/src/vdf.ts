// Minimal parser for Valve's text KeyValues (VDF): "key" "value" pairs and "key" { ... } blocks, // comments.
// Used for libraryfolders.vdf, appmanifest_*.acf and localconfig.vdf. Keys are case-insensitive in Steam, so
// lookups go through `child()`.

export type VdfValue = string | VdfObject;
export interface VdfObject {
  [key: string]: VdfValue;
}

export function parseVdf(text: string): VdfObject {
  const root: VdfObject = {};
  const stack: VdfObject[] = [root];
  let pendingKey: string | null = null;
  let i = 0;
  const n = text.length;

  const readString = (): string => {
    let out = '';
    i++; // opening quote
    while (i < n && text[i] !== '"') {
      if (text[i] === '\\' && i + 1 < n) {
        const next = text[i + 1];
        out += next === 'n' ? '\n' : next === 't' ? '\t' : (next ?? '');
        i += 2;
      } else {
        out += text[i];
        i++;
      }
    }
    i++; // closing quote
    return out;
  };

  while (i < n) {
    const ch = text[i];
    if (ch === undefined) break;
    if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
    } else if (ch === '"') {
      const s = readString();
      const top = stack[stack.length - 1];
      if (!top) break;
      if (pendingKey === null) pendingKey = s;
      else {
        top[pendingKey] = s;
        pendingKey = null;
      }
    } else if (ch === '{') {
      const top = stack[stack.length - 1];
      const obj: VdfObject = {};
      if (top && pendingKey !== null) top[pendingKey] = obj;
      stack.push(obj);
      pendingKey = null;
      i++;
    } else if (ch === '}') {
      if (stack.length > 1) stack.pop();
      pendingKey = null;
      i++;
    } else {
      i++;
    }
  }
  return root;
}

export function child(obj: VdfValue | undefined, key: string): VdfValue | undefined {
  if (obj === undefined || typeof obj === 'string') return undefined;
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(obj)) if (k.toLowerCase() === lower) return v;
  return undefined;
}

export function path(obj: VdfValue | undefined, ...keys: string[]): VdfValue | undefined {
  return keys.reduce<VdfValue | undefined>((o, k) => child(o, k), obj);
}

export function str(obj: VdfValue | undefined, key: string): string | undefined {
  const v = child(obj, key);
  return typeof v === 'string' ? v : undefined;
}

export function obj(v: VdfValue | undefined): VdfObject | undefined {
  return v !== undefined && typeof v !== 'string' ? v : undefined;
}
