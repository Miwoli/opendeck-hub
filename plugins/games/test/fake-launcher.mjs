#!/usr/bin/env node
// Fake steam / lutris binary: logs argv to $FAKE_LAUNCH_LOG and exits.
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.FAKE_LAUNCH_LOG, `${JSON.stringify(process.argv.slice(2))}\n`);
