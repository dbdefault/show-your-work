#!/usr/bin/env node
// show-your-work: hold a coding agent's claims up against what actually ran.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runHook } from '../lib/hook.mjs';
import { audit } from '../lib/audit.mjs';
import { readSession } from '../lib/transcript.mjs';
import { judge, reasonFor } from '../lib/verdict.mjs';
import { RULES } from '../lib/rules.mjs';
import { formatAudit } from '../lib/format.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const HELP = `show-your-work ${pkg.version}: hold a coding agent's claims up against what actually ran.

Usage:
  show-your-work audit [path...]    Check past sessions: which "tests pass" had a test
                              run behind it? Reads ~/.claude/projects by default.
      --days <n>              Only sessions changed in the last n days (default 30)
      --all                   Every session, however old
      --limit <n>             At most n sessions, newest first
      --json                  Machine-readable output
  show-your-work check <session.jsonl>
                              Judge the last message of one session. Exits 1 if
                              it claims something the session does not show.
  show-your-work hook               Run as a Claude Code Stop hook (reads stdin).
  show-your-work context            Print the rules, for a SessionStart hook.

Nothing is sent anywhere; every check runs on your machine.
Set SHOW_YOUR_WORK=warn to report without blocking, or SHOW_YOUR_WORK=off to disable.
Set SHOW_YOUR_WORK_CONTEXT=off to keep the check but not add the rules at session start.`;

function flag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  args.splice(i, 1);
  return true;
}

function option(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

async function main(argv) {
  const args = argv.slice(2);
  const cmd = args.shift();
  switch (cmd) {
    case 'hook':
      await runHook();
      return 0;
    case 'context':
      if (String(process.env.SHOW_YOUR_WORK ?? '').toLowerCase() === 'off' || String(process.env.SHOW_YOUR_WORK_CONTEXT ?? '').toLowerCase() === 'off') return 0;
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: RULES } }) + '\n');
      return 0;
    case 'audit': {
      const json = flag(args, '--json');
      const all = flag(args, '--all');
      const days = option(args, '--days');
      const limit = option(args, '--limit');
      const unknown = args.find((a) => a.startsWith('-'));
      if (unknown) {
        process.stderr.write(`show-your-work: unknown option ${unknown}\n`);
        return 2;
      }
      const result = audit({ paths: args, days: all ? 0 : Number(days ?? 30), limit: limit ? Number(limit) : undefined });
      process.stdout.write(json ? JSON.stringify(result, null, 2) + '\n' : formatAudit(result, { days: all ? 0 : Number(days ?? 30) }));
      return 0;
    }
    case 'check': {
      const file = args[0];
      if (!file) {
        process.stderr.write('show-your-work: check needs a session file\n');
        return 2;
      }
      const { events, cwd } = readSession(file);
      const verdict = judge(events, { cwd });
      if (!verdict.claims.length && !verdict.cited.length) {
        process.stdout.write('No claims in the last message.\n');
        return 0;
      }
      if (!verdict.violations.length) {
        process.stdout.write(`Every claim in the last message is backed (${verdict.claims.length} claim${verdict.claims.length === 1 ? '' : 's'}).\n`);
        return 0;
      }
      process.stdout.write(reasonFor(verdict) + '\n');
      return 1;
    }
    case '-v':
    case '--version':
      process.stdout.write(pkg.version + '\n');
      return 0;
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      process.stdout.write(HELP + '\n');
      return 0;
    default:
      process.stderr.write(`show-your-work: unknown command "${cmd}"\n\n${HELP}\n`);
      return 2;
  }
}

main(process.argv).then((code) => { process.exitCode = code; }, (err) => {
  process.stderr.write(`show-your-work: ${err && err.message ? err.message : err}\n`);
  process.exitCode = 1;
});
