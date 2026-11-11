// Minimal ZIP writer (Node fs + zlib only, no external zip/7z). Moved verbatim from the
// original claude-usage/ha-map pack.mjs; output verified with `unzip -t` and Python zipfile.
// OpenDeck (zip_extract.rs) extracts the FIRST folder whose name ends with ".sdplugin"
// (case-insensitive) into ~/.config/opendeck/plugins/<name>; the archive extension is not checked.

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date) {
  const dosTime =
    ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

export function buildZip(entries) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of entries) {
    const isDir = entry.data === null;
    const nameBuf = Buffer.from(entry.name + (isDir ? '/' : ''), 'utf8');
    const { dosTime, dosDate } = toDosDateTime(entry.mtime ?? new Date());

    let method = 0;
    let compressed = isDir ? Buffer.alloc(0) : entry.data;
    const crc = isDir ? 0 : crc32(entry.data);
    const uncompressedSize = isDir ? 0 : entry.data.length;

    if (!isDir && entry.data.length > 0) {
      const deflated = zlib.deflateRawSync(entry.data, { level: 9 });
      if (deflated.length < entry.data.length) {
        method = 8;
        compressed = deflated;
      }
    }

    const compressedSize = compressed.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // wersja wymagana do wypakowania
    localHeader.writeUInt16LE(0, 6); // flagi
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localChunks.push(localHeader, nameBuf, compressed);

    // Unix permissions (directory 755 / file 644) in the upper 16 bits
    // of the external attributes - force an unsigned number (>>> 0),
    // because << on values > 2^31 yields a negative Int32 in JS.
    const externalAttrs = isDir ? (((0o40755 << 16) | 0x10) >>> 0) : (0o100644 << 16) >>> 0;

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4); // "version made by": Unix
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(externalAttrs, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirStart = offset;
  const centralDirBuf = Buffer.concat(centralChunks);
  const centralDirSize = centralDirBuf.length;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirSize, 12);
  end.writeUInt32LE(centralDirStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDirBuf, end]);
}

export async function walk(dir, base) {
  const items = await readdir(dir, { withFileTypes: true });
  let entries = [];
  for (const item of items) {
    const full = path.join(dir, item.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (item.isDirectory()) {
      entries.push({ name: rel, data: null, mtime: (await stat(full)).mtime });
      entries = entries.concat(await walk(full, base));
    } else if (item.isFile()) {
      entries.push({ name: rel, data: await readFile(full), mtime: (await stat(full)).mtime });
    }
  }
  return entries;
}
