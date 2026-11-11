#!/usr/bin/env node
// Fake systemctl / spectacle: logs argv to $FAKE_CMD_LOG; for spectacle writes a PNG to the -o path.
import { appendFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_CMD_LOG, `${JSON.stringify(args)}\n`);
const o = args.indexOf('-o');
if (o >= 0 && args[o + 1]) writeFileSync(args[o + 1], Buffer.from('89504e470d0a1a0a', 'hex'));
if (process.env.FAKE_CMD_FAIL) process.exit(3);
