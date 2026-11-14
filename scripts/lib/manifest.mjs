// Manifest rules from CLAUDE.md "Hard rules" (OpenDeck rejects a manifest that breaks them). Returns a list of
// problems (empty = valid). `plugin` is the directory name under plugins/, `uuid` the *.sdPlugin name without the suffix.
// Version consistency with package.json is checked by check-versions.mjs, not here.

import { isDeepStrictEqual } from 'node:util';

const REQUIRED_STRINGS = ['Name', 'Author', 'Version', 'Icon'];
const FORBIDDEN = ['Description', 'SDKVersion', 'Software', 'UserTitleEnabled'];

export function manifestProblems({ plugin, uuid, manifest }) {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) return ['manifest must be a JSON object'];

  const problems = [];
  const expected = `com.miwoli.${plugin}`;
  if (uuid !== expected) problems.push(`plugin UUID "${uuid}" must be "${expected}"`);

  for (const key of REQUIRED_STRINGS) {
    if (typeof manifest[key] !== 'string' || manifest[key] === '') problems.push(`required field "${key}" missing or empty`);
  }
  if (!Array.isArray(manifest.Actions)) problems.push('required field "Actions" must be an array');
  if (!isDeepStrictEqual(manifest.OS, [{ Platform: 'linux' }])) problems.push('"OS" must be [{"Platform": "linux"}]');
  for (const key of FORBIDDEN) {
    if (Object.hasOwn(manifest, key)) problems.push(`forbidden field "${key}" (not in the OpenDeck schema)`);
  }

  (Array.isArray(manifest.Actions) ? manifest.Actions : []).forEach((action, i) => {
    const where = `Actions[${i}]`;
    if (typeof action !== 'object' || action === null) return problems.push(`${where} must be an object`);
    if (!isDeepStrictEqual(action.Controllers, ['Keypad'])) problems.push(`${where} "Controllers" must be ["Keypad"]`);
    const prefix = `${expected}.`;
    if (typeof action.UUID !== 'string' || !action.UUID.startsWith(prefix) || action.UUID.length === prefix.length) {
      problems.push(`${where} UUID "${action.UUID}" must be "${prefix}<action>"`);
    }
  });
  return problems;
}
