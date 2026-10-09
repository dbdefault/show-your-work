import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Session } from './helpers.mjs';
import { decide, mode } from '../lib/hook.mjs';
import { parseClaudeCode } from '../lib/transcript.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'show-your-work.mjs');
const reader = (s) => () => parseClaudeCode(s.toString());

const unbacked = () => new Session().user('fix').edit('/work/app/a.js').say('Fixed. All tests pass.');
const backed = () => new Session().user('fix').edit('/work/app/a.js').bash('npm test', 'Tests: 2 passed').say('Fixed. All tests pass.');

test('blocks an unbacked claim with a reason the agent can act on', () => {
  const out = decide({ transcript_path: 'x', last_assistant_message: 'Fixed. All tests pass.', cwd: '/work/app' }, { env: {}, read: reader(unbacked()) });
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /no test ran after your last edit/);
});

test('lets a backed claim through', () => {
  assert.equal(decide({ transcript_path: 'x', last_assistant_message: 'Fixed. All tests pass.' }, { env: {}, read: reader(backed()) }), null);
});

test('steps aside when already continuing because of a stop hook', () => {
  assert.equal(decide({ transcript_path: 'x', stop_hook_active: true, last_assistant_message: 'All tests pass.' }, { env: {}, read: reader(unbacked()) }), null);
});

test('a message with no claims never reads the transcript', () => {
  const read = () => { throw new Error('should not read'); };
  assert.equal(decide({ transcript_path: 'x', last_assistant_message: 'Here is the plan.' }, { env: {}, read }), null);
});

test('SHOW_YOUR_WORK=warn reports to the user without blocking; SHOW_YOUR_WORK=off disables', () => {
  const input = { transcript_path: 'x', last_assistant_message: 'All tests pass.' };
  const warned = decide(input, { env: { SHOW_YOUR_WORK: 'warn' }, read: reader(unbacked()) });
  assert.ok(warned.systemMessage && !warned.decision);
  assert.equal(decide(input, { env: { SHOW_YOUR_WORK: 'off' }, read: reader(unbacked()) }), null);
  assert.equal(mode({}), 'block');
});

test('falls back to the transcript when last_assistant_message is absent', () => {
  const out = decide({ transcript_path: 'x' }, { env: {}, read: reader(unbacked()) });
  assert.equal(out.decision, 'block');
});

function hook(stdin, env = {}) {
  return spawnSync(process.execPath, [BIN, 'hook'], { input: stdin, encoding: 'utf8', env: { ...process.env, SHOW_YOUR_WORK: '', ...env } });
}

test('the hook command blocks end to end and always exits 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'syw-'));
  try {
    const path = join(dir, 's.jsonl');
    writeFileSync(path, unbacked().toString());
    const r = hook(JSON.stringify({ transcript_path: path, cwd: '/work/app', hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'Fixed. All tests pass.' }));
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.decision, 'block');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the hook fails open on bad input and a missing transcript', () => {
  for (const stdin of ['not json', '', JSON.stringify({ transcript_path: '/nonexistent/x.jsonl', last_assistant_message: 'All tests pass.' })]) {
    const r = hook(stdin);
    assert.equal(r.status, 0, stdin);
    assert.equal(r.stdout, '', stdin);
  }
});

test('context prints the rules as SessionStart context', () => {
  const r = spawnSync(process.execPath, [BIN, 'context'], { encoding: 'utf8' });
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /^Show your work:/);
});

test('a log in another agent format is not judged', () => {
  const codexLike = () => ({ events: [], cwd: null, root: null });
  assert.equal(decide({ transcript_path: 'x', last_assistant_message: 'All tests pass.' }, { env: {}, read: codexLike }), null);
});
