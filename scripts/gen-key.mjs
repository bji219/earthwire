#!/usr/bin/env node
// Generate an Earthwire Pro key for a specific batch.
//
//   pnpm gen-key B02        one key
//   pnpm gen-key B02 5      five keys
//
// For the normal sales loop use `pnpm new-batch` instead — it picks the batch id,
// writes the PDF, and records the key. This script is for one-off replacements.

import { BATCH_RE, die, loadSecret, mintKey } from './lib/key.mjs';

const batch = (process.argv[2] ?? '').toUpperCase();
if (!BATCH_RE.test(batch)) {
  die("batch must be 'B' followed by two characters, e.g. B01, B02, B0A");
}

const count = Number(process.argv[3] ?? 1);
if (!Number.isInteger(count) || count < 1 || count > 100) {
  die('count must be a whole number between 1 and 100');
}

const secret = loadSecret();

for (let i = 0; i < count; i++) {
  console.log(await mintKey(batch, secret));
}
