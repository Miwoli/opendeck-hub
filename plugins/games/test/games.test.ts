import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { closeGame, findRunningGame, readProcs } from '../src/gameProcess.ts';
import { DEFAULT_LUTRIS_EXCLUDE, lutrisRows, recentGames, steamCover, steamGames, steamHidden } from '../src/library.ts';
import { closeGameTile, gameModeTile, launcherTile, recentTile } from '../src/tiles.ts';
import { child, parseVdf, path as vpath, str } from '../src/vdf.ts';
import { makeLibraries, makeProc } from './fixtures.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'games-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

describe('vdf', () => {
  it('parses nested blocks, escapes and comments; keys case-insensitive', () => {
    const v = parseVdf('// header\n"Root"\n{\n  "Name"  "A \\"q\\" b"\n  "Sub" { "x" "1" } // trailing\n}\n');
    assert.equal(str(child(v, 'root'), 'name'), 'A "q" b');
    assert.equal(str(vpath(v, 'ROOT', 'sub'), 'X'), '1');
    assert.deepEqual(parseVdf('"a" {'), { a: {} }, 'unterminated input does not throw');
  });
});

describe('libraries', async () => {
  const paths = await makeLibraries(path.join(dir, 'lib'));

  it('Steam: installed games from all libraries, tools filtered, last played and covers (also hashed subfolders)', () => {
    const games = steamGames(paths.steamRoot);
    assert.deepEqual(games.map((g) => [g.id, g.name, g.lastPlayed]).sort(), [['100', 'Alpha', 1000], ['200', 'Beta "Quoted"', 3000], ['300', 'Gamma', 0]]);
    assert.ok(steamCover(paths.steamRoot, '100')?.endsWith('header.jpg'));
    assert.ok(steamCover(paths.steamRoot, '200')?.endsWith(path.join('abc123', 'library_600x900.jpg')));
    assert.equal(steamCover(paths.steamRoot, '300'), null);
  });

  it('Steam: games hidden in the library are skipped (added minus removed)', () => {
    assert.deepEqual([...steamHidden(paths.steamRoot)], ['400']);
    assert.ok(!steamGames(paths.steamRoot).some((g) => g.id === '400'));
  });

  it('Lutris: installed only; launchers, parents and Steam-runner games skipped; cover via shorter slug', async () => {
    const rows = await lutrisRows(paths.lutrisDir);
    assert.equal(rows.length, 5);
    const games = await recentGames(paths);
    const lutris = games.filter((g) => g.source === 'lutris');
    assert.deepEqual(lutris.map((g) => g.name), ['Witcher X', 'Child']);
    assert.ok(lutris[0]?.cover?.endsWith('witcher-x.jpg'));
    assert.ok(DEFAULT_LUTRIS_EXCLUDE.includes('ubisoft-connect'));
  });

  it('recent list: newest first across both, never-played last', async () => {
    const games = await recentGames(paths);
    assert.deepEqual(games.map((g) => g.name), ['Beta "Quoted"', 'Witcher X', 'Child', 'Alpha', 'Gamma']);
  });

  it('missing directories give an empty list', async () => {
    assert.deepEqual(await recentGames({ steamRoot: path.join(dir, 'none'), lutrisDir: path.join(dir, 'none') }), []);
  });
});

describe('running game', () => {
  const proc = makeProc(path.join(dir, 'p1'), [
    { pid: 10, ppid: 1, cmd: ['/home/u/.local/share/Steam/ubuntu12_32/steam'] },
    { pid: 20, ppid: 10, cmd: ['/home/u/.local/share/Steam/ubuntu12_32/reaper', 'SteamLaunch', 'AppId=1427860', '--', 'proton'] },
    { pid: 21, ppid: 20, cmd: ['proton', 'waitforexitandrun'] },
    { pid: 22, ppid: 21, cmd: ['Game.exe'] },
    { pid: 30, ppid: 1, cmd: ['bash', '-c', 'echo SteamLaunch AppId=5'] },
  ]);

  it('finds the Steam game under reaper SteamLaunch AppId=… and its descendants only', () => {
    const game = findRunningGame(readProcs(proc));
    assert.deepEqual(game, { source: 'steam', pid: 20, appid: '1427860', descendants: [21, 22] });
  });

  it('finds a Lutris game under lutris-wrapper', () => {
    const lp = makeProc(path.join(dir, 'p2'), [
      { pid: 5, ppid: 1, cmd: ['/usr/bin/python3', '/usr/bin/lutris-wrapper', 'Witcher', '0', '1', 'wine', 'game.exe'] },
      { pid: 6, ppid: 5, cmd: ['wine', 'game.exe'] },
    ]);
    assert.deepEqual(findRunningGame(readProcs(lp)), { source: 'lutris', pid: 5, appid: null, descendants: [6] });
  });

  it('no marker or marker without children = no game', () => {
    const np = makeProc(path.join(dir, 'p3'), [{ pid: 20, ppid: 1, cmd: ['reaper', 'SteamLaunch', 'AppId=1'] }]);
    assert.equal(findRunningGame(readProcs(np)), null);
  });

  it('closeGame: SIGTERM deepest first, SIGKILL whatever survived the grace period', async () => {
    const game = findRunningGame(readProcs(proc));
    assert.ok(game);
    const signals: string[] = [];
    await closeGame(game, { procRoot: proc, graceMs: 10, kill: (pid, sig) => signals.push(`${sig}:${pid}`) });
    // fake /proc still lists both -> both get SIGKILL
    assert.deepEqual(signals, ['SIGTERM:22', 'SIGTERM:21', 'SIGKILL:22', 'SIGKILL:21']);
  });
});

describe('tiles', () => {
  it('match the Games page', () => {
    assert.deepEqual([launcherTile('lutris').tone, launcherTile('lutris').glyph, launcherTile('lutris').status], ['nav', 'lutris', 'Library']);
    assert.deepEqual([recentTile(null, 3, null).name, recentTile(null, 3, null).status], ['Game 3', 'empty']);
    const r = recentTile({ source: 'steam', id: '1', name: 'Alpha', lastPlayed: 1, cover: null }, 1, 'data:image/jpeg;base64,AA');
    assert.deepEqual([r.name, r.status, r.image], ['Alpha', 'Steam', 'data:image/jpeg;base64,AA']);
    assert.equal(gameModeTile(true).tone, 'on');
    assert.equal(gameModeTile(false).status, 'Off');
    assert.equal(closeGameTile({ phase: 'idle' }, false).status, 'no game');
    assert.equal(closeGameTile({ phase: 'idle' }, true).tone, 'danger');
    assert.equal(closeGameTile({ phase: 'confirm', secondsLeft: 2 }, true).name, 'Close?');
  });
});
