import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DiscordState } from '../src/bridge.ts';
import { headphonesTile, micTile, pttTile } from '../src/tiles.ts';

const base: DiscordState = { inVoice: true, selfMute: false, selfDeaf: false, serverMute: false, serverDeaf: false, mode: 'VOICE_ACTIVITY', ptt: false };

describe('tiles', () => {
  it('offline (no bridge) uses the offline tone everywhere', () => {
    for (const t of [micTile(null), headphonesTile(null), pttTile(null, false)]) {
      assert.equal(t.tone, 'offline');
      assert.equal(t.status, 'offline');
    }
  });

  it('mic: on / muted / deafened / server-muted', () => {
    assert.deepEqual([micTile(base).tone, micTile(base).status], [undefined, 'On']);
    assert.equal(micTile(base).statusTone, 'ok');
    assert.deepEqual([micTile({ ...base, selfMute: true }).tone, micTile({ ...base, selfMute: true }).glyph], ['alert', 'micOff']);
    assert.equal(micTile({ ...base, selfDeaf: true }).status, 'Muted');
    assert.equal(micTile({ ...base, serverMute: true }).status, 'Server');
    assert.equal(micTile({ ...base, serverMute: true }).name, 'Mic');
  });

  it('headphones: on / deafened / server-deafened', () => {
    assert.equal(headphonesTile(base).status, 'On');
    assert.deepEqual([headphonesTile({ ...base, selfDeaf: true }).tone, headphonesTile({ ...base, selfDeaf: true }).glyph], ['alert', 'headphonesOff']);
    assert.equal(headphonesTile({ ...base, serverDeaf: true }).status, 'Server');
    assert.equal(headphonesTile({ ...base, serverDeaf: true }).name, 'Headphones');
  });

  it('ptt: idle, held (Ember), and a warning when Discord is in its own PTT mode', () => {
    assert.deepEqual([pttTile(base, false).tone, pttTile(base, false).status], ['idle', 'Hold']);
    assert.deepEqual([pttTile(base, true).tone, pttTile(base, true).glyph], ['on', 'pttActive']);
    assert.equal(pttTile({ ...base, ptt: true }, false).tone, 'on');
    assert.equal(pttTile({ ...base, mode: 'PUSH_TO_TALK' }, true).status, 'set VAD');
  });
});
