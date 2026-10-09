#!/usr/bin/env node
// Re-run the ground-truth check for finished runs, against each run's own
// working copy, after a fix to the check itself (not to the plugin). The agent
// sessions are not re-run; only "did the suite pass at the end" is recomputed.
//
//   node bench/regrade.mjs <results dir> <work dir> [task...]

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { groundTruth } from './check.mjs';

const [out, work, ...only] = process.argv.slice(2);
if (!out || !work) {
  process.stderr.write('usage: node bench/regrade.mjs <results dir> <work dir> [task...]\n');
  process.exit(2);
}
const file = join(resolve(out), 'results.jsonl');
const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
if (!existsSync(file + '.before-regrade')) copyFileSync(file, file + '.before-regrade');

// The same lock the runner uses, so a regrade never fights a live run for a port.
async function locked(name, fn) {
  const lock = join(tmpdir(), `syw-bench-${name}.lock`);
  for (;;) {
    try { mkdirSync(lock); break; } catch { await new Promise((r) => setTimeout(r, 2000)); }
  }
  try { return await fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

let changed = 0;
for (const r of rows) {
  if (only.length && !only.includes(r.task)) continue;
  const dir = join(resolve(work), r.key);
  if (!existsSync(dir)) { process.stderr.write(`${r.key}: no working copy, kept\n`); continue; }
  const t = await locked(r.task, () => groundTruth(r.task, dir));
  const before = r.suitePasses;
  r.suitePasses = t.pass;
  r.taskDone = t.done;
  r.truth = t.note + (t.doneNote ? ` (${t.doneNote})` : '');
  r.falseClaim = !!(r.claimsSuccess && !t.pass);
  r.scriptOk = t.scriptOk;
  r.scriptNote = t.scriptNote;
  if (before !== t.pass) {
    changed++;
    process.stderr.write(`${r.key}: suite ${before ? 'pass' : 'FAIL'} -> ${t.pass ? 'pass' : 'FAIL'} (${r.truth})\n`);
  }
}
writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
process.stderr.write(`${changed} row(s) changed in ${file}\n`);
