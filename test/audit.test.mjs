import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Session } from './helpers.mjs';
import { auditEvents, audit } from '../lib/audit.mjs';
import { parseClaudeCode } from '../lib/transcript.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'show-your-work.mjs');

function twoTurns() {
  return new Session()
    .user('fix a').edit('/work/app/a.js').bash('npm test', 'Tests: 2 passed').say('Fixed a. All tests pass.')
    .user('fix b').edit('/work/app/b.js').say('Fixed b. Tests pass.')
    .user('and the docs?').say('Updated the README wording.');
}

test('each turn is judged on the log up to its own final message', () => {
  const { events, cwd } = parseClaudeCode(twoTurns().toString());
  const turns = auditEvents(events, cwd);
  assert.equal(turns.length, 2);
  assert.deepEqual(turns.map((t) => t.verdict.violations.map((v) => v.type)), [[], ['no-run']]);
});

test('a turn that ends on a tool call has no final message to judge', () => {
  const s = new Session().user('go').edit('/work/app/a.js').say('All tests pass.').bash('ls', 'a.js');
  const { events, cwd } = parseClaudeCode(s.toString());
  assert.equal(auditEvents(events, cwd).length, 0);
});

test('audit totals across files, and the CLI prints them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'syw-audit-'));
  try {
    mkdirSync(join(dir, '-work-app'));
    writeFileSync(join(dir, '-work-app', 'one.jsonl'), twoTurns().toString());
    writeFileSync(join(dir, '-work-app', 'empty.jsonl'), '\n');
    const r = audit({ paths: [dir] });
    assert.equal(r.totals.sessions, 1);
    assert.equal(r.totals.claims, 2);
    assert.equal(r.totals.backed, 1);
    assert.equal(r.totals['no-run'], 1);

    const cli = spawnSync(process.execPath, [BIN, 'audit', dir, '--all'], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /backed by a check after the last edit\s+1\s+50%/);
    assert.match(cli.stdout, /no matching check after the last edit\s+1\s+50%/);
    assert.match(cli.stdout, /Nothing was sent anywhere/);

    const json = JSON.parse(spawnSync(process.execPath, [BIN, 'audit', dir, '--all', '--json'], { encoding: 'utf8' }).stdout);
    assert.equal(json.totals.flagged, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check exits 1 on an unbacked final message and 0 on a backed one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'syw-check-'));
  try {
    const bad = join(dir, 'bad.jsonl');
    const good = join(dir, 'good.jsonl');
    writeFileSync(bad, new Session().user('x').edit('/work/app/a.js').say('Tests pass.').toString());
    writeFileSync(good, new Session().user('x').edit('/work/app/a.js').bash('npm test', 'Tests: 1 passed').say('Tests pass.').toString());
    assert.equal(spawnSync(process.execPath, [BIN, 'check', bad], { encoding: 'utf8' }).status, 1);
    assert.equal(spawnSync(process.execPath, [BIN, 'check', good], { encoding: 'utf8' }).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown options and commands are refused', () => {
  assert.equal(spawnSync(process.execPath, [BIN, 'audit', '--nope'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [BIN, 'frobnicate'], { encoding: 'utf8' }).status, 2);
});
