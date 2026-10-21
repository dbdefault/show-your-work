// Hold a final message up against the session that produced it. A claim is
// backed when the latest matching check after the last edit succeeded. A
// check from before the last edit proves nothing about the code as it is now.

import { isAbsolute, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { kindOfCommand, TEST_FILE } from './commands.mjs';
import { outcomeOf, summaryOf, ciStatusOf, testCount } from './outcome.mjs';
import { findClaims, citedCommands, disclosesFailure } from './claims.mjs';
import { segments } from './shell.mjs';

const DOC = /\.(?:md|mdx|markdown|txt|rst|adoc|org)$/i;
const TMP = [tmpdir(), '/tmp', '/var/tmp', '/private/tmp'].map((p) => resolve(p) + sep);

// Agent scratch space and version-control internals.
const SCRATCH = /(?:^|[\\/])(?:\.claude|\.git|\.codex|\.cursor|\.gemini|node_modules|__pycache__|\.pytest_cache|\.?scratch|\.?tmp|\.temp|\.cache)(?:[\\/]|$)/;

/**
 * Does an edit to this file change what the code does?
 * @param {string} file as written in the command or tool call
 * @param {string|null} cwd the shell's directory when it ran
 * @param {string|null} [root] the project: where the session started
 */
export function relevantFile(file, cwd, root = cwd) {
  if (!file) return false;
  if (file.startsWith('(')) return true; // (git apply), (git checkout)
  // A path still holding a shell variable could be anywhere; agents mostly
  // point those at scratch directories. Do not count what cannot be placed.
  if (file.includes('$') || file.includes('`')) return false;
  if (DOC.test(file) || SCRATCH.test(file)) return false;
  const abs = isAbsolute(file) ? resolve(file) : cwd ? resolve(cwd, file) : null;
  if (!abs) return true;
  if (SCRATCH.test(abs)) return false;
  // Inside the project counts wherever the project lives, /tmp included.
  if (root) return abs === resolve(root) || abs.startsWith(resolve(root) + sep);
  return !TMP.some((t) => abs.startsWith(t));
}

/**
 * Substitute variables assigned earlier in the same command line, so that
 * `T=/tmp/x; cat > $T/a.js` is seen to write /tmp/x/a.js.
 */
export function expandAssignments(line) {
  const vars = {};
  const re = /(?:^|[;&|\n]\s*|\s)([A-Za-z_][A-Za-z0-9_]*)=("[^"$`]*"|'[^']*'|[^\s;&|$`]+)(?=\s*(?:;|&&|\|\||\n|$))/g;
  let m;
  while ((m = re.exec(line))) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
  if (!Object.keys(vars).length) return line;
  return line.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (all, name) => (name in vars ? vars[name] : all));
}

/**
 * Every check that ran, and every edit, in order. A check is stale once a
 * later edit touches a file inside the directory it ran in.
 * @param {import('./transcript.mjs').Event[]} events
 * @param {string|null} cwd
 * @param {string|null} [root]
 */
export function evidence(events, cwd, root = cwd) {
  const results = new Map();
  const done = new Map();
  for (const e of events) {
    if (e.kind === 'result') results.set(e.id, e);
    else if (e.kind === 'done') done.set(e.id, e);
  }
  const edits = [];
  const runs = [];
  const ciRuns = []; // remote CI checks: a local edit does not make them stale
  const executed = [];
  const listings = []; // test files named by each directory listing the agent saw
  for (const e of events) {
    if (e.kind !== 'call') continue;
    const r = results.get(e.id);
    const here = e.cwd || cwd;
    if (e.edit) {
      const files = (e.files || []).filter((f) => relevantFile(f, here, root));
      if (files.length && !(r && r.isError)) edits.push({ i: e.i, files: files.map((f) => absolute(f, here)) });
      continue;
    }
    if (typeof e.shell === 'string') {
      executed.push(e.shell);
      const cmd = kindOfCommand(expandAssignments(e.shell));
      const isCheck = cmd.kind === 'test' || cmd.kind === 'build' || cmd.kind === 'lint';
      if (!isCheck) {
        const changed = [...(r ? r.editedPaths || [] : []), ...cmd.writes].filter((f) => relevantFile(f, here, root));
        if (changed.length && !(r && r.isError && !(r.editedPaths || []).length)) {
          edits.push({ i: e.i, files: changed.map((f) => absolute(f, here)) });
          continue;
        }
      }
      if (r && fullListing(e.shell)) listings.push(testFilesIn(r.text));
      if ((cmd.kind === 'read' || cmd.kind === 'other') && !cmd.kinds.includes('ci')) continue;
      let out;
      if (!r) out = { status: 'pending', quote: null, why: 'no result yet' };
      else if (r.background && done.has(e.id)) {
        const d = done.get(e.id);
        const ok = d.exitCode === 0 || (d.exitCode === null && /complete/i.test(d.status));
        out = { status: ok ? 'passed' : 'failed', quote: null, why: ok ? null : `exit code ${d.exitCode ?? d.status}` };
      } else out = outcomeOf(r, cmd);
      if (out.status === 'notrun') continue;
      const dir = cmd.dir && cmd.dir !== '$unknown' ? absolute(cmd.dir, here) : here;
      const entry = { i: e.i, command: e.shell, kind: cmd.kind, kinds: cmd.kinds, masked: cmd.masked, filter: cmd.filter, dir, count: r ? testCount(r.text) : null, ...out };
      if (cmd.kinds.includes('ci') && r) {
        const status = ciStatusOf(r);
        if (status === 'passed' || status === 'failed') ciRuns.push({ ...entry, kind: 'ci', kinds: ['ci'], status, why: status === 'failed' ? 'the CI output shows a failure' : null, quote: null });
      }
      if (cmd.kind !== 'ci') runs.push(entry);
      continue;
    }
    if ((e.tool === 'Glob' || e.tool === 'LS') && r) {
      if (e.tool === 'LS' || GENERIC_TEST_GLOB.test(String(e.input.pattern || ''))) listings.push(testFilesIn(r.text));
      continue;
    }
    if (e.delegate && r && !r.isError) {
      // A subagent's report is second-hand, but it is all the log holds of
      // its work. Count it when it carries a summary line.
      const quote = summaryOf(r.text);
      if (quote) {
        const failed = /\b[1-9]\d*\s+(?:fail|failed|failing|failures?)\b|\bFAIL\b/.test(quote);
        runs.push({ i: e.i, command: `(${e.tool}: ${String(e.input.description || e.input.subagent_type || 'subagent')})`, kind: 'test', kinds: ['test', 'build', 'run'], masked: null, dir: null, status: failed ? 'failed' : 'passed', quote, why: failed ? 'the subagent reported failures' : null, delegated: true });
      }
    }
  }
  return { edits, runs, ciRuns, executed, listings, lastEdit: edits[edits.length - 1] || null };
}

// A search for test files in general, not for one name: *.test.js, test_*.py, tests/**.
const GENERIC_TEST_GLOB = /(?:^|[\\/])(?:\*\*[\\/])?(?:\*[._-]?(?:test|spec)s?\.|(?:test|spec)s?[_.-]?\*|\*_test\.)|(?:^|[\\/])(?:tests?|specs?|__tests__)[\\/]\*/i;

/**
 * Does this command list a directory as it is, rather than search it for a
 * name? `ls test/` and `find test -type f` show every test file there;
 * `find . -name "*money*"` shows only the ones that match.
 */
export function fullListing(line) {
  const segs = segments(line);
  if (segs.length !== 1 && !segs.every((x, i) => i === 0 || /^(?:head|tail|sort|wc|cat)\b/.test(x.text))) return false;
  const argv = segs[0] ? segs[0].text.split(/\s+/) : [];
  const tool = argv[0];
  const args = argv.slice(1);
  if (tool === 'ls' || tool === 'tree') return args.every((a) => a.startsWith('-') || !/[*?[]/.test(a));
  if (tool === 'find' || tool === 'fd') {
    for (let i = 0; i < args.length; i++) {
      if (/^-(?:i?name|i?path|i?regex|wholename)$/.test(args[i])) {
        if (args[i - 1] === '-not' || args[i - 1] === '!') continue; // an exclusion narrows nothing we care about
        const pat = (args[i + 1] || '').replace(/^["']|["']$/g, '');
        if (!GENERIC_TEST_GLOB.test(pat)) return false;
      }
    }
    if (tool === 'fd' && args.some((a) => !a.startsWith('-') && !/^[.\/\w-]+$/.test(a))) return false;
    return true;
  }
  if (tool === 'git' && args[0] === 'ls-files') return args.slice(1).every((a) => a.startsWith('-') || !/[*?[]/.test(a) || GENERIC_TEST_GLOB.test(a));
  return false;
}

/** Test file names in a listing's output. */
function testFilesIn(text) {
  const names = new Set();
  for (const tok of String(text || '').split(/[\s'"`,:()[\]]+/)) {
    const base = tok.replace(/\\/g, '/').split('/').pop();
    if (base && TEST_FILE.test(base)) names.add(base);
  }
  return names;
}

/**
 * Did a run limited to one file still cover the whole suite? Yes when an
 * unfiltered run reported no more tests than it did, or when a listing the
 * agent saw names that file and no other test file.
 */
function coversSuite(run, runs, listings) {
  const full = runs.filter((r) => r.kind === 'test' && !r.filter && r.count !== null);
  if (run.count !== null && full.length && full.every((r) => r.count <= run.count)) return true;
  const base = String(run.filter).replace(/\\/g, '/').split('/').pop();
  if (!TEST_FILE.test(base)) return false;
  return listings.some((names) => names.has(base) && names.size === 1);
}

function absolute(f, here) {
  if (f.startsWith('(')) return f;
  return isAbsolute(f) ? resolve(f) : here ? resolve(here, f) : f;
}

/** The first edit after a run that touches a file inside the run's directory. */
function staleningEdit(run, edits) {
  for (const ed of edits) {
    if (ed.i <= run.i) continue;
    if (!run.dir) return ed;
    const base = resolve(run.dir) + sep;
    if (ed.files.some((f) => f.startsWith('(') || resolve(f).startsWith(base) || resolve(f) === resolve(run.dir))) return ed;
  }
  return null;
}

// A local claim needs a local check; a claim about CI needs a look at CI.
const ACCEPTS = {
  test: ['test'],
  build: ['build', 'lint', 'test'],
  works: ['test', 'build', 'lint', 'run'],
  ci: ['ci'],
};

/**
 * @param {import('./transcript.mjs').Event[]} events
 * @param {{finalText?: string, cwd?: string|null}} [opts]
 */
export function judge(events, opts = {}) {
  const finalText = opts.finalText ?? lastSay(events);
  const claims = findClaims(finalText);
  const cited = citedCommands(finalText);
  if (!claims.length && !cited.length) return { claims, cited, violations: [], lastEdit: null, runs: [] };
  const { edits, runs, ciRuns, executed, listings, lastEdit } = evidence(events, opts.cwd ?? null, opts.root ?? opts.cwd ?? null);
  const violations = [];
  for (const claim of claims) {
    const pool = claim.kind === 'ci' ? ciRuns : runs;
    // A claim on a "`cmd` → result" line is about that command's run; any
    // other claim is about whichever check of its kind ran.
    const matching = claim.command
      ? pool.filter((r) => wasRun(claim.command, [r.command]))
      : pool.filter((r) => ACCEPTS[claim.kind].includes(r.kind) || r.kinds.some((k) => ACCEPTS[claim.kind].includes(k)));
    if (claim.command && !matching.length) continue; // never ran: the phantom check reports it
    // Remote CI is not made stale by a local edit; a local check is.
    const fresh = claim.kind === 'ci' ? matching : matching.filter((r) => !staleningEdit(r, edits));
    // "It works" is backed by any run that worked after the last edit; a
    // later failing test run is judged by the test claims, not this one.
    const ok = (r) => r.status !== 'failed' && r.status !== 'empty';
    const latest = claim.kind === 'works' && !claim.command && fresh.some(ok) ? fresh.filter(ok).pop() : fresh[fresh.length - 1];
    // A weak claim ("Fixed", "Not checked: nothing") is only held to account
    // when code changed, and "nothing unverified" only when tests ran at all.
    if (claim.weak && !lastEdit) continue;
    if (claim.weak && claim.kind === 'test' && !latest) continue;
    if (!latest) {
      const stale = matching[matching.length - 1];
      violations.push({ type: 'no-run', claim, edit: stale ? staleningEdit(stale, edits) || lastEdit : lastEdit });
    } else if (latest.status === 'failed') {
      // "2 of 3 pass, and the suite exits 1": the failure is on the record,
      // so nobody is being told the tests pass.
      if (disclosesFailure(finalText)) continue;
      violations.push({ type: 'failed', claim, run: latest, edit: lastEdit });
    } else if (latest.status === 'empty') {
      violations.push({ type: 'empty', claim, run: latest, edit: lastEdit });
    } else if (claim.all && latest.filter && !fresh.some((r) => r.kind === 'test' && !r.filter && r.status !== 'failed' && r.status !== 'empty' && !staleningEdit(r, edits)) && !coversSuite(latest, runs, listings)) {
      violations.push({ type: 'partial', claim, run: latest, edit: lastEdit });
    }
  }
  for (const c of cited) {
    if (!wasRun(c, executed)) violations.push({ type: 'phantom', command: c });
  }
  return { claims, cited, violations, lastEdit, runs: [...runs, ...ciRuns].sort((a, b) => a.i - b.i) };
}

function lastSay(events) {
  for (let k = events.length - 1; k >= 0; k--) {
    const e = events[k];
    if (e.kind === 'say') return e.text;
    if (e.kind === 'user') return '';
  }
  return '';
}

function norm(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/** Did a command like this one run? Lenient: prefix either way, or the same words. */
export function wasRun(cited, executed) {
  // `node check.mjs <repo>/src/a.js`: a placeholder stands for whatever was there.
  if (/<[^<>\s]{1,40}>/.test(cited)) {
    const re = new RegExp(norm(cited).split(/<[^<>\s]{1,40}>/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\S+'));
    if (executed.some((line) => re.test(norm(line)))) return true;
  }
  // `node -e "..."`: an abbreviated citation matches any run it is the start of.
  const cut = cited.search(/\.\.\.|…/);
  if (cut > 0) {
    const head = norm(cited.slice(0, cut).replace(/["'`]+$/, ''));
    if (head.split(' ').length >= 2) return executed.some((line) => norm(line).startsWith(head) || segments(line).some((x) => norm(x.text).startsWith(head)));
  }
  const c = norm(cited);
  const citedSegs = segments(cited).map((x) => norm(x.text)).filter(Boolean);
  const cw = c.split(' ').filter((w) => !w.startsWith('-'));
  const same = (t, x) => t === x || t.startsWith(x + ' ') || x.startsWith(t + ' ') || t.includes(x);
  const all = [];
  for (const line of executed) {
    if (norm(line).includes(c)) return true;
    all.push(...segments(line).map((x) => norm(x.text)));
  }
  // `npm test; echo $?` cited as one piece of evidence: every part must have run.
  if (citedSegs.length > 1) return citedSegs.every((cs) => all.some((t) => same(t, cs)));
  for (const t of all) {
    if (same(t, c)) return true;
    const tw = new Set(t.split(' '));
    if (cw.length >= 2 && cw.every((w) => tw.has(w))) return true;
  }
  return false;
}

function shortFile(f) {
  if (!f) return '';
  const s = f.replace(/\\/g, '/');
  const parts = s.split('/');
  return parts.length > 2 ? parts.slice(-2).join('/') : s;
}

const NOUN = { test: 'test', build: 'build or type-check', works: 'check or run', ci: 'CI status check (gh run view, gh pr checks)' };

/**
 * The message the agent reads when it is stopped.
 * @param {ReturnType<typeof judge>} verdict
 */
export function reasonFor(verdict) {
  const lines = ['show-your-work: your last message claims more than this session shows.'];
  for (const v of verdict.violations) {
    const ed = v.edit;
    const since = v.claim && v.claim.kind === 'ci' ? 'in this session' : ed ? `after your last edit (${ed.files.slice(0, 2).map(shortFile).join(', ')})` : 'in this session';
    if (v.type === 'no-run') {
      lines.push(`- You wrote "${v.claim.text}", but no ${NOUN[v.claim.kind]} ran ${since}.`);
    } else if (v.type === 'failed') {
      lines.push(`- You wrote "${v.claim.text}", but the last ${v.run.kind} run ${since} failed (${v.run.why}): \`${oneLine(v.run.command)}\`${v.run.quote ? ` → ${v.run.quote}` : ''}`);
    } else if (v.type === 'empty') {
      lines.push(`- You wrote "${v.claim.text}", but the last test run ${since} ran no tests: \`${oneLine(v.run.command)}\`${v.run.quote ? ` → ${v.run.quote}` : ''}`);
    } else if (v.type === 'partial') {
      lines.push(`- You wrote "${v.claim.text}", but the last test run ${since} ran only ${v.run.filter}, not the project's whole test command: \`${oneLine(v.run.command)}\``);
    } else if (v.type === 'phantom') {
      lines.push(`- You cite \`${v.command}\` as evidence, but no such command ran in this session.`);
    }
  }
  lines.push('Run the check now and quote its result line, or correct the message to say plainly what you did not verify.');
  return lines.join('\n');
}

function oneLine(cmd, n = 100) {
  const s = norm(String(cmd).split('\n')[0]);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
