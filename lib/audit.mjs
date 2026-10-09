// Audit past sessions: for every turn that ended with a claim, was the claim
// backed by a check that ran after the last edit? Everything is read locally
// and nothing is sent anywhere.

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { parseClaudeCode } from './transcript.mjs';
import { judge } from './verdict.mjs';
import { findClaims, citedCommands } from './claims.mjs';

/** Every Claude Code session file under a directory, newest first. */
export function sessionFiles(root, sinceMs = 0) {
  const out = [];
  const walk = (dir, depth) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 4) walk(p, depth + 1);
      } else if (e.isFile() && e.name.endsWith('.jsonl')) {
        try {
          const st = statSync(p);
          if (st.mtimeMs >= sinceMs && st.size > 0) out.push({ path: p, mtimeMs: st.mtimeMs, size: st.size });
        } catch { /* gone */ }
      }
    }
  };
  walk(root, 0);
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function defaultRoot(env = process.env) {
  return join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
}

/**
 * Split events into turns and judge each turn's final message.
 * @param {import('./transcript.mjs').Event[]} events
 * @param {string|null} cwd
 */
export function auditEvents(events, cwd, root = cwd) {
  const turns = [];
  let start = 0;
  const flush = (end) => {
    // The final message is the last thing the agent said, if nothing ran after it.
    let finalIdx = -1;
    for (let k = end - 1; k >= start; k--) {
      const e = events[k];
      if (e.kind === 'say') { finalIdx = k; break; }
      if (e.kind === 'call' || e.kind === 'result') break;
    }
    if (finalIdx === -1) return;
    const text = events[finalIdx].text;
    if (!findClaims(text).length && !citedCommands(text).length) return;
    const verdict = judge(events.slice(0, finalIdx + 1), { finalText: text, cwd, root });
    turns.push({ index: finalIdx, text, verdict });
  };
  for (let k = 0; k < events.length; k++) {
    if (events[k].kind === 'user') {
      flush(k);
      start = k + 1;
    }
  }
  flush(events.length);
  return turns;
}

/**
 * @param {{paths?: string[], days?: number, root?: string, limit?: number}} opts
 */
export function audit(opts = {}) {
  const sinceMs = opts.days ? Date.now() - opts.days * 864e5 : 0;
  let files;
  if (opts.paths && opts.paths.length) {
    files = [];
    for (const p of opts.paths) {
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) files.push(...sessionFiles(p, sinceMs));
      else files.push({ path: p, mtimeMs: st.mtimeMs, size: st.size });
    }
  } else {
    files = sessionFiles(opts.root || defaultRoot(), sinceMs);
  }
  if (opts.limit) files = files.slice(0, opts.limit);

  const totals = { sessions: 0, turns: 0, claims: 0, backed: 0, 'no-run': 0, failed: 0, empty: 0, partial: 0, phantom: 0, flagged: 0 };
  const examples = [];
  for (const f of files) {
    let text;
    try { text = readFileSync(f.path, 'utf8'); } catch { continue; }
    const { events, cwd, root } = parseClaudeCode(text);
    if (!events.length) continue;
    totals.sessions++;
    for (const t of auditEvents(events, cwd, root)) {
      totals.turns++;
      totals.claims += t.verdict.claims.length;
      const bad = new Set(t.verdict.violations.filter((v) => v.claim).map((v) => v.claim));
      totals.backed += t.verdict.claims.filter((c) => !bad.has(c)).length;
      for (const v of t.verdict.violations) totals[v.type]++;
      if (t.verdict.violations.length) {
        totals.flagged++;
        examples.push({
          session: basename(f.path, '.jsonl'),
          project: projectName(cwd, f.path),
          when: new Date(f.mtimeMs).toISOString().slice(0, 10),
          violation: t.verdict.violations[0],
          lastEdit: t.verdict.lastEdit,
        });
      }
    }
  }
  return { files: files.length, totals, examples };
}

function projectName(cwd, path) {
  if (cwd) return basename(cwd);
  return basename(dirname(path)).replace(/^-/, '').split('-').pop();
}
