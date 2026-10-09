// The files that make this installable in each agent must agree with each other.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../lib/rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');
const json = (p) => JSON.parse(read(p));

test('versions agree across every manifest', () => {
  const v = json('package.json').version;
  for (const f of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.cursor-plugin/plugin.json', '.github/plugin/plugin.json']) {
    assert.equal(json(f).version, v, f);
  }
  for (const p of json('.claude-plugin/marketplace.json').plugins) assert.equal(p.version, v);
});

test('agents other than Claude Code get the skills but not the Claude-format hooks', () => {
  for (const f of ['.codex-plugin/plugin.json', '.cursor-plugin/plugin.json', '.github/plugin/plugin.json']) {
    const m = json(f);
    assert.match(m.skills, /skills\/$/, f);
    assert.deepEqual(json(m.hooks.replace(/^\.\//, '')), { hooks: {} }, f);
  }
  // Claude Code loads hooks/hooks.json by itself; naming it again drops every hook.
  assert.equal(json('.claude-plugin/plugin.json').hooks, undefined);
});

test('AGENTS.md carries the same rules the SessionStart hook gives', () => {
  assert.ok(read('AGENTS.md').includes(RULES));
});

test('every skill has a name and a description in its frontmatter', () => {
  for (const dir of ['show-your-work', 'audit']) {
    const text = read(`skills/${dir}/SKILL.md`);
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
    assert.ok(fm, dir);
    assert.match(fm[1], new RegExp(`^name: ${dir}$`, 'm'));
    const desc = /^description: (.+)$/m.exec(fm[1]);
    assert.ok(desc && desc[1].length > 40 && desc[1].length <= 1024, dir);
  }
});

test('the hooks point at a script that exists', () => {
  const hooks = json('hooks/hooks.json').hooks;
  for (const event of ['Stop', 'SessionStart']) {
    const cmd = hooks[event][0].hooks[0].command;
    const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"/.exec(cmd);
    assert.ok(m && existsSync(join(root, m[1])), cmd);
  }
});
