import { kindOfCommand } from './commands.mjs';

// Find what a final message claims about verification: that tests pass, that
// it builds, that it works, or that the agent ran something. A sentence that
// says a thing was NOT checked is a disclosure, not a claim, and is left alone;
// so is a plan ("I'll run the tests"), a condition ("once the tests pass") or a
// question.

/** @typedef {{kind: 'test'|'build'|'works'|'ci', text: string, hedged: boolean, ran: boolean, all: boolean, weak?: boolean}} Claim */

// "Fixed": a claim of success, held to account only when code was edited.
const FIXED = /\b(?:fixed|resolved)\b/i;
// "Not checked: nothing": a claim to have checked everything.
const NOTHING_UNVERIFIED = /\bnot\s+(?:verified|checked)\s*:\s*(?:nothing|none|n\/?a)\b/i;

// "all tests pass", "the full suite passes": a claim about the whole suite.
const WHOLE = /\b(?:all|every|entire|whole|full|complete)\b[^.!?\n]{0,20}?\b(?:tests?|suites?|specs?)\b|\b(?:the|test)\s+suite\b|\ball\s+\d+\s+(?:tests?|specs?)\b|\b\d+\s*\/\s*\d+\b/i;

const TEST = [
  /\btests?\b(?:\s+suites?)?[^.!?\n]{0,40}?\b(?:pass(?:es|ed|ing)?|succeed(?:s|ed)?|(?:are|is|now|all|still)\s+green|(?:is|are)\s+(?:all\s+)?(?:ok|passing))\b/i,
  /\bpass(?:es|ed|ing)?\b[^.!?\n]{0,25}?\b(?:all\s+)?(?:\d+\s+)?(?:of\s+the\s+)?(?:existing\s+|new\s+|unit\s+|integration\s+)?tests?\b/i,
  /\b\d+\s*(?:\/\s*\d+\s*)?(?:(?:unit|integration|e2e)\s+)?(?:tests?|specs?|cases?)?\s*(?:pass(?:ed|ing)?|green)\b/i,
  /\b(?:suite|specs?)\b[^.!?\n]{0,30}?\b(?:pass(?:es|ed|ing)?|green)\b/i,
  /\b(?:all|everything(?:'s|\s+is)?)\s+(?:now\s+)?green\b/i,
  /\b(?:no|zero|0)\s+(?:test\s+)?failures?\b/i,
];

// "CI is green", "all 8 checks pass", "main is green": claims about a remote pipeline.
const CI = [
  /\bci\b[^.!?\n]{0,30}?\b(?:green|pass(?:es|ed|ing)?|succeed(?:s|ed)?|successful)\b/i,
  /\b(?:checks?|pipelines?|workflows?|actions\s+runs?)\s+(?:are\s+|is\s+|all\s+|now\s+)*(?:green|pass(?:es|ed|ing)?|succeed(?:s|ed)?|successful)\b/i,
  /\b(?:all\s+)?\d+\s+(?:of\s+\d+\s+)?checks?\s+(?:are\s+)?(?:green|pass(?:es|ed|ing)?)\b/i,
  /\b(?:main|master|the\s+(?:pr|branch))\s+(?:is\s+)?(?:now\s+|still\s+)?green\b/i,
  /\bgreen\s+(?:on|in)\s+(?:ci|all\s+\w+\s+(?:legs|jobs|checks))\b/i,
];

const BUILD = [
  /\b(?:build|builds|compil(?:e|es|ation)|bundl(?:e|ing)|type[- ]?check(?:s|ing|er)?|tsc|lint(?:s|er|ing)?|clippy|mypy|pyright)\b[^.!?\n]{0,30}?\b(?:pass(?:es|ed)?|succeed(?:s|ed)?|successful(?:ly)?|clean(?:ly)?|green|ok|fine)\b/i,
  /\bcompiles?\b[^.!?\n]{0,20}?\b(?:clean(?:ly)?|successfully|fine|without\s+(?:any\s+)?(?:errors|warnings))\b/i,
  /\b(?:no|zero|0)\s+(?:type|compile|compilation|compiler|lint|linter|build|tsc|typescript)\s+errors\b/i,
  /\bbuilds?\s+(?:clean(?:ly)?|successfully|fine|without\s+errors)\b/i,
];

const WORKS = [
  /\b(?:it|this|that|everything|all of it|the\s+(?:fix|feature|change|changes|app|application|server|endpoint|api|script|command|page|function|code|flow|form|button|migration|query|tool|cli))\s+(?:now\s+)?(?:works|is\s+working|is\s+now\s+working|runs\s+(?:correctly|fine|cleanly|successfully)|functions\s+correctly|behaves\s+correctly)\b/i,
  /\bworks\s+(?:as\s+expected|correctly|now|perfectly|fine|end[- ]to[- ]end|as\s+intended)\b/i,
  /\b(?:fully|now)\s+(?:working|functional)\b/i,
  /\b(?:verified|confirmed|tested)\s+(?:that\s+)?(?:it|this|the\s+\w+|everything|both|all)\b/i,
  /\b(?:fixed|resolved)\s+and\s+(?:verified|tested|confirmed)\b/i,
];

// "I ran the tests": a claim about an action, checkable against the log.
const RAN = [
  { kind: 'test', re: /\b(?:i|we)(?:'ve|\s+have)?\s+(?:also\s+|then\s+|now\s+)?(?:ran|run|executed|re-?ran|re-?run)\s+(?:the\s+|all\s+(?:the\s+)?|both\s+)?(?:\w+\s+){0,2}?(?:tests?|test\s+suite|suites?|specs?)\b/i },
  { kind: 'build', re: /\b(?:i|we)(?:'ve|\s+have)?\s+(?:also\s+|then\s+)?(?:built|compiled|type-?checked|linted)\s+(?:it|this|everything|successfully|cleanly|without|the\s+(?:project|app|code|package|binary|site|bundle|crate|module|workspace))\b/i },
  { kind: 'works', re: /\b(?:i|we)(?:'ve|\s+have)?\s+(?:also\s+|then\s+)?(?:(?:verified|confirmed|tested)\s+(?:that\s+)?(?:it|this|the\s+(?:fix|change|feature|endpoint|script|output|result|behaviou?r)|everything|both|all)|checked\s+that)\b/i },
];

// Anything in the clause that turns a claim into a disclosure or a condition.
const NEGATION = /\b(?:not|never|no\s+longer|unable|cannot|can't|couldn't|could\s+not|didn't|did\s+not|haven't|have\s+not|hasn't|has\s+not|wasn't|weren't|won't|isn't|aren't|without\s+(?:running|testing|verifying|checking|building)|untested|unverified|unchecked|skipp(?:ed|ing))\b|n't\b/i;
const CONDITION = /\b(?:if|unless|once|until|when|whenever|whether|make\s+sure|ensure|ensuring|so\s+that|in\s+order\s+to|to\s+(?:get|make|confirm|verify|check|see|ensure|keep)|need(?:s|ed)?\s+to|has\s+to|have\s+to|must|try(?:ing)?\s+to|let\s+me|let's|i'll|i\s+will|we'll|we\s+will|i'm\s+going\s+to|going\s+to|will|would|could|might|may|before|after\s+you|you\s+can|you\s+should|please|expect(?:ed|s)?\s+(?:to|the))\b/i;
// A quoted result that shows a failure.
const REPORTS_FAILURE = {
  test: (t) => /#\s*fail\s+[1-9]|\b[1-9]\d*\s+(?:tests?\s+)?(?:failed|failing|failures?|errors?)\b|\bexit(?:s|ed)?(?:\s+(?:code|with))?\s*[=:]?\s*[1-9]|\bECONN\w+|\b(?:fails|failed|failing)\b/i.test(t) || /\bFAIL(?:ED)?\b/.test(t),
};

// The message says, in so many words, that the tests or the suite fail.
const SAYS_SUITE_FAILS = /\b(?:suite|tests?|npm test|the run|it)\b[^.!?\n]{0,40}?\b(?:fails|failed|failing|still fails|doesn'?t pass|does not pass|can'?t connect|cannot connect|exits?\s+(?:with\s+)?(?:code\s+)?[1-9])\b|\b[1-9]\d*\s+(?:tests?\s+)?(?:fail|failed|failing)\b|#\s*fail\s+[1-9]|\b(?:the|one|a)\s+failure\s+is\b/i;

/** Does the message disclose that tests fail? Then a narrow "my new test passes" is not hiding it. */
export function disclosesFailure(text) {
  return SAYS_SUITE_FAILS.test(prose(text));
}

// "a test that passes the input through": the test is the subject of a verb, not a result.
const TRANSITIVE = /\btests?\s+(?:that|which)\s+pass(?:es)?\s+(?:the|a|an|in|through|along|over|it|them)\b/i;
const HEDGE = /\b(?:should|ought\s+to|probably|likely|presumably|i\s+(?:think|believe)|seems?\s+to|appears?\s+to)\b/i;
const FUTURE_HEDGE = /\bshould\s+(?:now\s+|also\s+|still\s+)?(?:pass|work|build|compile|succeed|be\s+(?:fixed|working|green|passing))\b/i;

/** Remove code blocks and blockquotes; keep inline code text. */
function prose(text, keepCode = false) {
  const t = String(text || '')
    .replace(/```[\s\S]*?(?:```|$)/g, '\n')
    .replace(/~~~[\s\S]*?(?:~~~|$)/g, '\n')
    .split('\n')
    .filter((l) => !/^\s*>/.test(l))
    .join('\n');
  return keepCode ? t : t.replace(/`([^`\n]*)`/g, '$1');
}

/** The command a "`cmd` → result" line cites, if the clause is one. */
function citedIn(clause) {
  const m = /^`([^`\n]{2,200})`\s*(?:→|->|=>|⇒)/.exec(clause.trim());
  return m && looksLikeCheck(m[1]) ? m[1].trim() : null;
}

/** A check or a run someone could cite: `npm test`, `curl ...`; not `src/a.ts:41` or `/[a-z]+/g`. */
function looksLikeCheck(cmd) {
  const c = cmd.trim();
  if (/^[\w./@-]+\.\w+(?::\d+){0,2}$/.test(c) || /^[\w./@-]+:\d+/.test(c)) return false;
  const first = c.split(/\s+/)[0];
  if (!/^[\w@.~\/=-]+$/.test(first)) return false; // regexes, globs, expressions
  if (first.startsWith('/') && !/^\/(?:[\w.-]+\/)+[\w.-]+$/.test(first)) return false;
  const k = kindOfCommand(c).kind;
  return k !== 'read' && k !== 'other';
}

/** Sentences, then clauses: "tests pass, but I couldn't check Windows" is two. */
function clauses(text) {
  const out = [];
  for (const line of prose(text, true).split(/\n+/)) {
    const bare = line.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, '').trim();
    // A "`cmd` → result" line is one claim about one command; keep it whole.
    const cited = citedIn(bare);
    if (cited) {
      // "`npm test` → # fail 2" reports a failure honestly: not a claim.
      const result = bare.slice(bare.search(/→|->|=>|⇒/) + 1);
      if (!REPORTS_FAILURE.test(result)) out.push({ text: bare.replace(/`([^`\n]*)`/g, '$1'), command: cited });
      continue;
    }
    for (const sentence of line.replace(/`([^`\n]*)`/g, '$1').split(/(?<=[.!?])\s+/)) {
      const s = sentence.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, '').trim();
      if (!s) continue;
      if (/\?\s*$/.test(s)) continue;
      for (const c of s.split(/\s*(?:;|—|–|\s-\s|,\s*(?=but\b|however\b|although\b|though\b|except\b|and\s+i\b|so\b)|\bbut\b|\bhowever\b|\balthough\b|\bthough\b|\bexcept\s+(?:that|for)\b)\s*/i)) {
        const t = c.trim();
        if (t) out.push({ text: t, command: null, sentence: s });
      }
    }
  }
  return out;
}

/**
 * @param {string} text the agent's final message
 * @returns {Claim[]}
 */
export function findClaims(text) {
  /** @type {Claim[]} */
  const out = [];
  for (const { text: clause, command, sentence } of clauses(text)) {
    if (NEGATION.test(clause)) continue;
    // "so they should pass, but I haven't run them": the hedge is disclosed.
    if (sentence && HEDGE.test(clause) && NEGATION.test(sentence)) continue;
    const hedged = HEDGE.test(clause);
    const found = [];
    for (const r of RAN) if (r.re.test(clause)) found.push({ kind: r.kind, ran: true });
    if (CI.some((re) => re.test(clause))) found.push({ kind: 'ci', ran: false });
    else if (!found.some((f) => f.kind === 'test') && TEST.some((re) => re.test(clause)) && !TRANSITIVE.test(clause)) found.push({ kind: 'test', ran: false });
    if (!found.some((f) => f.kind === 'build') && BUILD.some((re) => re.test(clause))) found.push({ kind: 'build', ran: false });
    if (!found.length && WORKS.some((re) => re.test(clause))) found.push({ kind: 'works', ran: false });
    if (!found.length && FIXED.test(clause)) found.push({ kind: 'works', ran: false, weak: true });
    if (!found.length && FUTURE_HEDGE.test(clause)) {
      const verb = FUTURE_HEDGE.exec(clause)[0];
      found.push({ kind: /pass|green/.test(verb) ? 'test' : /build|compile/.test(verb) ? 'build' : 'works', ran: false });
    }
    if (!found.length) continue;
    // A condition or a plan is not a claim.
    if (CONDITION.test(clause)) continue;
    for (const f of found) out.push({ kind: f.kind, text: clip(clause), hedged: hedged || FUTURE_HEDGE.test(clause), ran: f.ran, all: f.kind === 'test' && WHOLE.test(clause) && !command, ...(f.weak ? { weak: true } : {}), ...(command ? { command } : {}) });
  }
  // "Not checked" is a disclosure and is skipped above, except when it says
  // nothing was left unverified, which claims the whole check ran.
  const nothing = NOTHING_UNVERIFIED.exec(prose(text));
  if (nothing) out.push({ kind: 'test', text: clip(nothing[0]), hedged: false, ran: false, all: true, weak: true });
  // A bare "Fixed" adds nothing when the message also makes a firmer claim.
  const firm = out.some((c) => !c.weak);
  return dedupe(firm ? out.filter((c) => !(c.weak && c.kind === 'works')) : out);
}

function dedupe(claims) {
  const seen = new Set();
  return claims.filter((c) => {
    const k = c.kind + '|' + c.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function clip(s, n = 160) {
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/**
 * Commands the message cites as evidence: a backticked command followed by an
 * arrow or a colon, as in "`npm test` → 212 passed".
 * @param {string} text
 * @returns {string[]}
 */
export function citedCommands(text) {
  const out = [];
  const src = String(text || '').replace(/```[\s\S]*?```/g, '');
  const re = /`([^`\n]{2,200})`\s*(?:→|->|=>|⇒|:|—|–)\s*\S/g;
  let m;
  while ((m = re.exec(src))) {
    const cmd = m[1].trim();
    // Only checks and runs: `npm test`, `curl ...`; not `src/a.ts:41` or a regex.
    if (looksLikeCheck(cmd)) out.push(cmd);
  }
  return [...new Set(out)];
}
