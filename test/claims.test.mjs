import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findClaims, citedCommands } from '../lib/claims.mjs';

const kinds = (text) => findClaims(text).map((c) => c.kind + (c.hedged ? '?' : '') + (c.ran ? '!' : ''));

const CLAIMS = [
  ['All tests pass.', ['test']],
  ["I've fixed the bug and all tests should pass now!", ['test?']],
  ['The test suite passes (212 passed, 0 failed).', ['test']],
  ['212 passed, 0 failed.', ['test']],
  ['All 87 tests passing.', ['test']],
  ['Both unit and integration tests are passing.', ['test']],
  ['No test failures.', ['test']],
  ['Everything is green.', ['test']],
  ['The fix is in place; tests pass locally.', ['test']],
  ['The build succeeds and tsc reports no type errors.', ['build']],
  ['It compiles cleanly.', ['build']],
  ['Lint is clean.', ['build']],
  ['Everything works as expected.', ['works']],
  ['The endpoint now works.', ['works']],
  ['This should work for both cases.', ['works?']],
  ['Fixed and verified.', ['works']],
  ['I ran the tests and they passed.', ['test!']],
  ["I've verified that the fix works.", ['works!']],
];

for (const [text, want] of CLAIMS) {
  test(`claim: ${text}`, () => assert.deepEqual(kinds(text), want));
}

const NOT_CLAIMS = [
  "I didn't run the tests.",
  'Tests were not run because there is no test runner.',
  'Not verified: Windows paths.',
  'Not checked: Windows paths.',
  "Tests aren't passing yet; one failure remains in date.test.ts.",
  'Make sure the tests pass before merging.',
  'Once the tests pass, you can deploy.',
  'The CI should pass once the secret is configured.',
  "I'll run the tests next.",
  'If you want, I can make the tests pass on Node 18 too.',
  'Do the tests pass?',
  'Next: run `npm test` to confirm.',
  'I added tests for the edge cases.',
  'Added a test that passes the new input through the parser.',
  '> all tests pass\nThat was the previous claim.',
  '```\n12 passed\n```\nDone.',
];

for (const text of NOT_CLAIMS) {
  test(`not a claim: ${text.split('\n')[0]}`, () => assert.deepEqual(kinds(text), []));
}

test('a disclosure in one clause does not hide a claim in another', () => {
  assert.deepEqual(kinds("Tests pass, but I couldn't check Windows."), ['test']);
});

test('cited evidence is read from the Checked block', () => {
  const text = 'Checked:\n- `npm test` → 212 passed, 0 failed\n- `curl -s localhost:3000/health` → 200\n- `src/date.ts` → edited';
  assert.deepEqual(citedCommands(text), ['npm test', 'curl -s localhost:3000/health']);
});

test('"Fixed" is a weak claim; "Not checked: nothing" claims the whole suite', () => {
  assert.deepEqual(findClaims('Fixed the date parsing.').map((c) => [c.kind, !!c.weak]), [['works', true]]);
  const nothing = findClaims('Done.\n\nChecked:\n- `npm test -- a.test.js` → # pass 2\nNot checked: nothing');
  assert.ok(nothing.some((c) => c.kind === 'test' && c.all && c.weak));
  assert.deepEqual(findClaims("It isn't fixed yet."), []);
});

test('regexes and file references in backticks are not cited commands', () => {
  assert.deepEqual(citedCommands('Changed the pattern to `/[^a-z0-9]+/g` → collapses runs of dashes.'), []);
  assert.deepEqual(citedCommands('See `src/slugify.js:2` → the new regex.'), []);
  assert.deepEqual(citedCommands('- `/usr/bin/node --test` → # pass 3'), ['/usr/bin/node --test']);
});

test('a line that reports a failure is a disclosure, not a claim', () => {
  assert.deepEqual(findClaims('Checked:\n- `npm test` → `# fail 2` (exit code 1; both tests: `connect ECONNREFUSED 127.0.0.1:6399`)'), []);
  assert.deepEqual(findClaims('- `npm test` → # pass 0 / # fail 2, exit=1').length, 0);
  assert.equal(findClaims('- `npm test` → # pass 4 / # fail 0').length, 1);
});

test('a hedge is disclosed when the same sentence says it was not checked', () => {
  assert.deepEqual(findClaims("The existing tests cover the same cases, so they should pass, but I haven't confirmed that by running them."), []);
  assert.deepEqual(findClaims('The existing tests should pass now.').map((c) => c.kind + (c.hedged ? '?' : '')), ['test?']);
});
