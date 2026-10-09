// The Stop hook. Claude Code runs it when the agent is about to hand back; if
// the final message claims a result the session cannot show, it blocks once
// and tells the agent what is missing. Anything unexpected lets the agent
// stop: a broken check must never trap anyone.

import { readSession } from './transcript.mjs';
import { judge, reasonFor } from './verdict.mjs';
import { findClaims, citedCommands } from './claims.mjs';

/** Read all of stdin, or '' if nothing arrives in time. */
export function readStdin(timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    const timer = setTimeout(() => resolve(data), timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(''); });
  });
}

export function mode(env = process.env) {
  const m = String(env.SHOW_YOUR_WORK ?? 'block').trim().toLowerCase();
  if (['off', '0', 'false', 'no', 'disable', 'disabled'].includes(m)) return 'off';
  if (m === 'warn') return 'warn';
  return 'block';
}

/**
 * Decide what to print for one Stop event.
 * @param {object} input the hook's stdin JSON
 * @param {{env?: object, read?: typeof readSession}} [deps]
 * @returns {object|null} the JSON to print, or null to let the agent stop
 */
export function decide(input, deps = {}) {
  const m = mode(deps.env);
  if (m === 'off' || !input || typeof input !== 'object') return null;
  // Already continuing because of a Stop hook: say it once, then step aside.
  if (input.stop_hook_active) return null;
  const finalText = typeof input.last_assistant_message === 'string' ? input.last_assistant_message : null;
  if (finalText !== null && !findClaims(finalText).length && !citedCommands(finalText).length) return null;
  if (typeof input.transcript_path !== 'string' || !input.transcript_path) return null;
  const { events, cwd, root } = (deps.read || readSession)(input.transcript_path);
  // A log this reader does not understand (another agent's format) holds no
  // evidence either way. Judging it would block every claim, so do not judge.
  if (!events.some((e) => e.kind === 'call' || e.kind === 'say')) return null;
  const verdict = judge(events, { finalText: finalText ?? undefined, cwd: typeof input.cwd === 'string' ? input.cwd : cwd, root });
  if (!verdict.violations.length) return null;
  const reason = reasonFor(verdict);
  if (m === 'warn') return { systemMessage: reason };
  return { decision: 'block', reason };
}

export async function runHook() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) return;
    const out = decide(JSON.parse(raw));
    if (out) process.stdout.write(JSON.stringify(out) + '\n');
  } catch {
    // Fail open.
  }
}
