import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { parsePlayerSettings } from '../src/actions/player.ts';
import { loadCover, sniffMime } from '../src/cover.ts';
import { type PlayerState, PlayerFocus, choosePlayer, nextPlayer, parseList, parseProperties, playerLabel } from '../src/mpris.ts';
import { mediaTile } from '../src/tiles.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'media-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

const player = (bus: string, status: PlayerState['status'], extra: Partial<PlayerState> = {}): PlayerState => ({ bus, status, title: 'Track', artist: 'Artist', artUrl: '', ...extra });

describe('mpris parsing', () => {
  it('lists only MPRIS bus names', () => {
    assert.deepEqual(parseList(JSON.stringify([{ name: ':1.2' }, { name: 'org.mpris.MediaPlayer2.spotify' }, { name: 'org.mpris.MediaPlayer2.firefox.instance_1_2523' }, { name: 'org.kde.KWin' }])), [
      'org.mpris.MediaPlayer2.spotify', 'org.mpris.MediaPlayer2.firefox.instance_1_2523',
    ]);
    assert.deepEqual(parseList('nope'), []);
  });

  it('parses get-property output (Spotify uses s/t types, Zen o/x)', () => {
    const out = `${JSON.stringify({ type: 's', data: 'Playing' })}\n${JSON.stringify({ type: 'a{sv}', data: {
      'mpris:trackid': { type: 's', data: '/com/spotify/track/x' }, 'mpris:length': { type: 't', data: 1 },
      'xesam:title': { type: 's', data: 'T' }, 'xesam:artist': { type: 'as', data: ['A', 'B'] }, 'mpris:artUrl': { type: 's', data: 'https://i.scdn.co/image/x' } } })}\n`;
    assert.deepEqual(parseProperties('org.mpris.MediaPlayer2.spotify', out), {
      bus: 'org.mpris.MediaPlayer2.spotify', status: 'Playing', title: 'T', artist: 'A, B', artUrl: 'https://i.scdn.co/image/x',
    });
    assert.equal(parseProperties('b', '{"type":"s","data":"Weird"}\n{}'), null);
    assert.equal(parseProperties('b', ''), null);
  });

  it('chooses preferred > playing > paused', () => {
    const list = [player('org.mpris.MediaPlayer2.haruna', 'Paused'), player('org.mpris.MediaPlayer2.firefox.instance_1_1', 'Playing'), player('org.mpris.MediaPlayer2.spotify', 'Paused')];
    assert.equal(choosePlayer(list, '')?.bus, 'org.mpris.MediaPlayer2.firefox.instance_1_1');
    assert.equal(choosePlayer(list, 'spotify')?.bus, 'org.mpris.MediaPlayer2.spotify');
    assert.equal(choosePlayer(list, 'vlc')?.bus, 'org.mpris.MediaPlayer2.firefox.instance_1_1', 'missing preferred falls back');
    assert.equal(choosePlayer([], ''), null);
    assert.equal(playerLabel('org.mpris.MediaPlayer2.firefox.instance_1_2523'), 'Firefox');
  });

  it('focus wins over the playing order; stopped focus is ignored', () => {
    const list = [player('org.mpris.MediaPlayer2.firefox.instance_1_1', 'Playing'), player('org.mpris.MediaPlayer2.spotify', 'Paused'), player('org.mpris.MediaPlayer2.vlc', 'Stopped')];
    assert.equal(choosePlayer(list, '', 'org.mpris.MediaPlayer2.spotify')?.bus, 'org.mpris.MediaPlayer2.spotify');
    assert.equal(choosePlayer(list, '', 'org.mpris.MediaPlayer2.vlc')?.bus, 'org.mpris.MediaPlayer2.firefox.instance_1_1');
    assert.equal(choosePlayer(list, 'firefox', 'org.mpris.MediaPlayer2.spotify')?.bus, 'org.mpris.MediaPlayer2.firefox.instance_1_1', 'preferred pins the tile');
  });

  it('nextPlayer cycles active players only', () => {
    const ff = player('org.mpris.MediaPlayer2.firefox.instance_1_1', 'Playing');
    const sp = player('org.mpris.MediaPlayer2.spotify', 'Paused');
    const vlc = player('org.mpris.MediaPlayer2.vlc', 'Stopped');
    assert.equal(nextPlayer([sp, ff, vlc], ff)?.bus, sp.bus);
    assert.equal(nextPlayer([sp, ff, vlc], sp)?.bus, ff.bus, 'wraps, skips stopped');
    assert.equal(nextPlayer([ff, vlc], ff), null, 'nothing else to switch to');
    assert.equal(nextPlayer([ff, vlc], vlc)?.bus, ff.bus);
    assert.equal(nextPlayer([], null), null);
  });

  it('focus follows the player that started last, until it stops', () => {
    const f = new PlayerFocus();
    const sp = 'org.mpris.MediaPlayer2.spotify';
    const ff = 'org.mpris.MediaPlayer2.firefox.instance_1_1';
    f.observe([player(sp, 'Playing'), player(ff, 'Paused')]);
    assert.equal(f.current, sp);
    f.observe([player(sp, 'Playing'), player(ff, 'Playing')]);
    assert.equal(f.current, ff, 'YouTube started -> follow it');
    f.set(sp);
    f.observe([player(sp, 'Playing'), player(ff, 'Playing')]);
    assert.equal(f.current, sp, 'manual pick sticks while nothing new starts');
    f.observe([player(ff, 'Playing')]);
    assert.equal(f.current, null, 'focused player quit');
  });

  it('settings default to long press = next, double tap = switch', () => {
    assert.deepEqual(parsePlayerSettings({}), { preferred: '', longPress: 'next', doubleTap: 'switch' });
    assert.deepEqual(parsePlayerSettings({ preferred: ' spotify ', longPress: 'switch', doubleTap: 'bogus' }), { preferred: 'spotify', longPress: 'switch', doubleTap: 'switch' });
  });
});

describe('cover', () => {
  it('sniffs PNG/JPEG only', () => {
    assert.equal(sniffMime(PNG), 'image/png');
    assert.equal(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
    assert.equal(sniffMime(Buffer.from('<svg')), null);
  });

  it('reads local file:// art', async () => {
    const file = path.join(dir, 'art.png');
    writeFileSync(file, PNG);
    assert.match((await loadCover(pathToFileURL(file).href, { allowRemote: false })) ?? '', /^data:image\/png;base64,/);
    assert.equal(await loadCover(pathToFileURL(path.join(dir, 'missing.png')).href, { allowRemote: false }), null);
  });

  it('downloads https art only with consent, then serves it from the disk cache', async () => {
    let fetches = 0;
    const fetchImpl = (async () => {
      fetches += 1;
      return new Response(PNG, { status: 200 });
    }) as typeof fetch;
    const url = 'https://i.scdn.co/image/abc';
    assert.equal(await loadCover(url, { allowRemote: false, fetchImpl, cacheDir: dir }), null);
    assert.equal(fetches, 0, 'no network without consent');
    assert.ok(await loadCover(url, { allowRemote: true, fetchImpl, cacheDir: dir }));
    assert.ok(await loadCover(url, { allowRemote: true, fetchImpl, cacheDir: dir }));
    assert.equal(fetches, 1, 'second read from cache');
    assert.equal(await loadCover('http://insecure/x', { allowRemote: true, fetchImpl, cacheDir: dir }), null);
  });
});

describe('tiles', () => {
  it('playing / paused / stopped / none', () => {
    const playing = mediaTile(player('org.mpris.MediaPlayer2.spotify', 'Playing'), 'data:image/png;base64,AA');
    assert.deepEqual([playing.glyph, playing.name, playing.status, playing.image], ['bars', 'Track', 'Artist', 'data:image/png;base64,AA']);
    const paused = mediaTile(player('org.mpris.MediaPlayer2.spotify', 'Paused'), null);
    assert.deepEqual([paused.glyph, paused.paused, paused.status, paused.image], ['play', true, 'Paused', undefined]);
    assert.equal(mediaTile(player('org.mpris.MediaPlayer2.spotify', 'Stopped'), null).status, 'stopped');
    assert.deepEqual([mediaTile(null, null).name, mediaTile(null, null).status], ['Media', 'nothing playing']);
    assert.equal(mediaTile(player('org.mpris.MediaPlayer2.haruna', 'Playing', { title: '', artist: '' }), null).name, 'Haruna');
  });

  it('pips for several active players; source name after a switch', () => {
    const ff = player('org.mpris.MediaPlayer2.firefox.instance_1_1', 'Playing');
    const sp = player('org.mpris.MediaPlayer2.spotify', 'Paused');
    const vlc = player('org.mpris.MediaPlayer2.vlc', 'Stopped');
    assert.deepEqual(mediaTile(sp, null, { players: [sp, ff, vlc] }).pips, { lit: [true, false], current: 1 });
    assert.equal(mediaTile(ff, null, { players: [ff, vlc] }).pips, undefined);
    assert.equal(mediaTile(sp, null, { players: [sp, ff], showSource: true }).status, 'Spotify');
  });
});
