// Synthetic Steam/Lutris/proc trees shaped like the real ones on this machine (no real game data).

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

export async function makeLibraries(root: string): Promise<{ steamRoot: string; lutrisDir: string }> {
  const steamRoot = path.join(root, 'Steam');
  const extra = path.join(root, 'SteamLibrary');
  const lutrisDir = path.join(root, 'lutris');
  const w = (p: string, data: string | Buffer): void => {
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, data);
  };
  w(path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"${steamRoot}"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"${extra}"\n\t}\n\t"2"\n\t{\n\t\t"path"\t\t"${path.join(root, 'unmounted')}"\n\t}\n}\n`);
  const manifest = (lib: string, appid: string, name: string): void =>
    w(path.join(lib, 'steamapps', `appmanifest_${appid}.acf`), `"AppState"\n{\n\t"appid"\t\t"${appid}"\n\t"name"\t\t"${name}"\n}\n`);
  manifest(steamRoot, '100', 'Alpha');
  manifest(extra, '200', 'Beta "Quoted"'.replace(/"/g, '\\"'));
  manifest(steamRoot, '1391110', 'Steam Linux Runtime 2.0 (soldier)');
  manifest(steamRoot, '300', 'Gamma');
  w(path.join(steamRoot, 'userdata', '42', 'config', 'localconfig.vdf'), `"UserLocalConfigStore"\n{\n\t"Software"\n\t{\n\t\t"Valve"\n\t\t{\n\t\t\t"Steam"\n\t\t\t{\n\t\t\t\t"apps"\n\t\t\t\t{\n\t\t\t\t\t"100"\n\t\t\t\t\t{\n\t\t\t\t\t\t"LastPlayed"\t\t"1000"\n\t\t\t\t\t}\n\t\t\t\t\t"200"\n\t\t\t\t\t{\n\t\t\t\t\t\t"LastPlayed"\t\t"3000"\n\t\t\t\t\t}\n\t\t\t\t\t"1391110"\n\t\t\t\t\t{\n\t\t\t\t\t\t"LastPlayed"\t\t"9999"\n\t\t\t\t\t}\n\t\t\t\t\t"999"\n\t\t\t\t\t{\n\t\t\t\t\t\t"LastPlayed"\t\t"8888"\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}\n`);
  w(path.join(steamRoot, 'appcache', 'librarycache', '100', 'header.jpg'), JPG);
  manifest(steamRoot, '400', 'Hidden One');
  w(path.join(steamRoot, 'userdata', '42', 'config', 'cloudstorage', 'cloud-storage-namespace-1.json'), JSON.stringify([
    ['user-collections.hidden', { key: 'user-collections.hidden', timestamp: 1, value: JSON.stringify({ id: 'hidden', name: '', added: [400, 300], removed: [300] }), version: '1' }],
    ['user-collections.favorite', { key: 'user-collections.favorite', value: JSON.stringify({ added: [100] }) }],
  ]));
  w(path.join(steamRoot, 'appcache', 'librarycache', '200', 'abc123', 'library_600x900.jpg'), JPG);

  w(path.join(lutrisDir, 'coverart', 'witcher-x.jpg'), JPG);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path.join(lutrisDir, 'pga.db'));
  db.exec('CREATE TABLE games (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, installer_slug TEXT, parent_slug TEXT, runner TEXT, installed INTEGER, lastplayed INTEGER)');
  const ins = db.prepare('INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  ins.run(1, 'Launcher', 'ubisoft-connect', null, null, 'wine', 1, 5000);
  ins.run(2, 'Witcher X', 'witcher-x-remastered', 'witcher_goty', null, 'wine', 1, 2000);
  ins.run(3, 'Via Steam', 'via-steam', 'steam-1', null, 'steam', 1, 7000);
  ins.run(4, 'Child', 'child', null, 'my-launcher', 'wine', 1, 1500);
  ins.run(5, 'My Launcher', 'my-launcher', null, null, 'wine', 1, 6000);
  ins.run(6, 'Removed', 'removed', null, null, 'wine', 0, 9000);
  db.close();
  return { steamRoot, lutrisDir };
}

export function makeProc(root: string, procs: Array<{ pid: number; ppid: number; cmd: string[] }>): string {
  const proc = path.join(root, 'proc');
  for (const p of procs) {
    mkdirSync(path.join(proc, String(p.pid)), { recursive: true });
    writeFileSync(path.join(proc, String(p.pid), 'stat'), `${p.pid} (some (name)) S ${p.ppid} 1 1 0`);
    writeFileSync(path.join(proc, String(p.pid), 'cmdline'), `${p.cmd.join('\0')}\0`);
  }
  mkdirSync(path.join(proc, 'self'), { recursive: true });
  return proc;
}
