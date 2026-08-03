#!/usr/bin/env node
// Mint the next batch of Earthwire Pro and produce everything needed to sell it.
//
//   pnpm new-batch          next batch after the last one in the ledger
//   pnpm new-batch B07      a specific batch id
//
// Writes .keys/earthwire-pro-<batch>.pdf (upload this to Etsy) and appends the
// key to .keys/ledger.json. Both are gitignored — this repo is public.

import { mkdirSync, createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import PDFDocument from 'pdfkit';

import { ALPHABET, BATCH_RE, die, loadSecret, mintKey, nextBatch } from './lib/key.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Overridable so tests never append to the real ledger.
const KEYS_DIR = process.env.EARTHWIRE_KEYS_DIR
  ? resolve(process.env.EARTHWIRE_KEYS_DIR)
  : resolve(ROOT, '.keys');
const LEDGER = resolve(KEYS_DIR, 'ledger.json');

const SITE_URL = (process.env.SITE_URL ?? readEnv('SITE_URL') ?? 'https://earthwire.space').replace(/\/$/, '');
const SHOP_URL = process.env.ETSY_SHOP_URL ?? readEnv('ETSY_SHOP_URL') ?? 'idw3d.etsy.com';
const BATCH_SIZE = 5;

const INK = '#2C2C2C';
const ACCENT = '#1A6B5A';
const MUTED = '#9B9B9B';
const BORDER = '#DDD8CF';
const WASH = '#F4F1EA';

function readEnv(name) {
  try {
    const match = readFileSync(resolve(ROOT, '.env'), 'utf8').match(
      new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, 'm'),
    );
    return match?.[1]?.trim().replace(/^["']|["']$/g, '') || null;
  } catch {
    return null;
  }
}

function loadLedger() {
  try {
    const parsed = JSON.parse(readFileSync(LEDGER, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function batchIndex(batch) {
  return ALPHABET.indexOf(batch[1]) * 32 + ALPHABET.indexOf(batch[2]);
}

// Pick from the highest id ever issued, not the last row, so a manually added
// out-of-order entry can never cause a batch id to be reused.
function pickBatch(ledger) {
  const explicit = process.argv[2]?.toUpperCase();
  if (explicit) {
    if (!BATCH_RE.test(explicit)) die("batch must be 'B' followed by two characters, e.g. B02");
    if (ledger.some(e => e.batch === explicit)) {
      die(`batch ${explicit} is already in the ledger. Reusing it would put two keys under one revocation unit`);
    }
    return explicit;
  }
  const valid = ledger.map(e => e.batch).filter(b => BATCH_RE.test(b ?? ''));
  if (valid.length === 0) return 'B01';
  return nextBatch(valid.reduce((a, b) => (batchIndex(b) > batchIndex(a) ? b : a)));
}

function buildPdf(path, { batch, key, issued }) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 0, info: {
    Title: 'Earthwire Pro Unlock Key',
    Author: 'Earthwire',
    Subject: `Batch ${batch}`,
  } });
  doc.pipe(createWriteStream(path));

  const M = 72;
  const W = doc.page.width - M * 2;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(ACCENT)
    .text('EARTHWIRE PRO', M, M, { characterSpacing: 3 });

  doc.font('Times-Bold').fontSize(30).fillColor(INK)
    .text('Your unlock key', M, M + 26, { width: W });

  doc.font('Helvetica').fontSize(11).fillColor(INK)
    .text(
      'Thank you for supporting Earthwire. This key lifts every limit: unlimited kit exports, the waveform trim editor, and unlimited uploads of your own sounds.',
      M, M + 68, { width: W, lineGap: 3 },
    );

  const boxY = M + 130;
  doc.roundedRect(M, boxY, W, 74, 5).fillAndStroke(WASH, BORDER);
  doc.font('Courier-Bold').fontSize(19).fillColor(INK)
    .text(key, M, boxY + 29, { width: W, align: 'center', characterSpacing: 1 });

  let y = boxY + 104;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text('How to unlock', M, y);
  y += 22;

  const steps = [
    `Go to ${SITE_URL}`,
    'Click "Unlock Pro" in the top bar.',
    'Type the key above and press Unlock.',
    'The badge changes to "Pro" and every limit is lifted.',
  ];
  for (const [i, step] of steps.entries()) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(ACCENT).text(`${i + 1}.`, M, y, { width: 16 });
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(step, M + 18, y, { width: W - 18, lineGap: 2 });
    y += 20;
  }

  y += 16;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text('FAQ', M, y);
  y += 22;

  const faq = [
    ['Does the key expire?', 'No. It works forever.'],
    [
      'Do I have to type it exactly?',
      'No. Capital letters and dashes are ignored, so type it however you like.',
    ],
    [
      'Can I use it on more than one computer?',
      'Yes. The key is saved in the browser you unlock, so enter it again on any other machine or browser. Keep this file so you always have it.',
    ],
    [
      'Something went wrong. Can you help?',
      `Message me through ${SHOP_URL} with your order number and I will sort it out.`,
    ],
  ];
  for (const [q, a] of faq) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(q, M, y, { width: W });
    y = doc.font('Helvetica').fontSize(10).fillColor(INK)
      .text(a, M, y + 14, { width: W, lineGap: 2 }).y + 12;
  }

  doc.moveTo(M, doc.page.height - M - 26).lineTo(M + W, doc.page.height - M - 26).strokeColor(BORDER).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text(`Batch ${batch} · issued ${issued.slice(0, 10)} · Earthwire · OP-1 and OP-1 Field drum kit designer`,
      M, doc.page.height - M - 16, { width: W });

  doc.end();
  return new Promise((res, rej) => {
    doc.on('end', res);
    doc.on('error', rej);
  });
}

const secret = loadSecret();
mkdirSync(KEYS_DIR, { recursive: true });

const ledger = loadLedger();
const batch = pickBatch(ledger);
const key = await mintKey(batch, secret);
const issued = new Date().toISOString();

const pdfPath = resolve(KEYS_DIR, `earthwire-pro-${batch}.pdf`);
await buildPdf(pdfPath, { batch, key, issued });

ledger.push({ batch, key, issued });
writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');

console.log(`
  batch   ${batch}
  key     ${key}
  pdf     .keys/earthwire-pro-${batch}.pdf
  site    ${SITE_URL}   <- the PDF tells buyers to go here

  Next:
    1. Upload that PDF to the Etsy listing, replacing the old file.
    2. Set the listing quantity back to ${BATCH_SIZE}.

  No deploy needed. The key works as soon as it is minted.
`);
