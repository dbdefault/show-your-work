import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segments, words, redirectTargets } from '../lib/shell.mjs';

test('splits chained commands and keeps the operator after each', () => {
  assert.deepEqual(segments('npm test && echo ok || echo bad; ls | wc -l'), [
    { text: 'npm test', op: '&&' },
    { text: 'echo ok', op: '||' },
    { text: 'echo bad', op: ';' },
    { text: 'ls', op: '|' },
    { text: 'wc -l', op: null },
  ]);
});

test('does not split inside quotes, $( ) or backticks', () => {
  assert.deepEqual(segments(`echo "a && b" 'c | d' $(npm test | tail -1) \`x;y\``).length, 1);
});

test('a trailing & marks the command as backgrounded', () => {
  assert.deepEqual(segments('node server.js &'), [{ text: 'node server.js', op: '&' }]);
});

test('2>&1 is a redirection, not the background operator', () => {
  assert.deepEqual(segments('npm test 2>&1 | tail -5'), [
    { text: 'npm test 2>&1', op: '|' },
    { text: 'tail -5', op: null },
  ]);
});

test('a heredoc body is data, not commands', () => {
  const segs = segments("cat > src/a.js <<'EOF'\nnpm test\nrm -rf /\nEOF\nnode src/a.js");
  assert.deepEqual(segs.map((s) => s.text), ["cat > src/a.js <<'EOF'", 'node src/a.js']);
});

test('newlines separate commands; backslash-newline continues one', () => {
  assert.deepEqual(segments('npm ci\nnpm test').map((s) => s.text), ['npm ci', 'npm test']);
  assert.deepEqual(segments('npm test \\\n  -- --ci').map((s) => s.text), ['npm test    -- --ci']);
});

test('words drops quotes and keeps empty arguments', () => {
  assert.deepEqual(words(`git commit -m "fix: a b" ''`), ['git', 'commit', '-m', 'fix: a b', '']);
});

test('redirect targets ignore descriptors and /dev', () => {
  assert.deepEqual(redirectTargets('npm test > out.log 2>&1'), ['out.log']);
  assert.deepEqual(redirectTargets('echo x >> "notes file.txt"'), ['notes file.txt']);
  assert.deepEqual(redirectTargets('cmd > /dev/null 2>&1'), []);
  assert.deepEqual(redirectTargets('cmd >&2'), []);
});
