# Contributing

Thanks for looking. show-your-work is small on purpose, and most useful changes are
one of these:

- **A command it misreads.** A test runner, build tool or wrapper that
  `lib/commands.mjs` does not recognise, or a runner whose summary line
  `lib/outcome.mjs` cannot quote. Add the command to the table in
  `test/commands.test.mjs` (or the output to `test/outcome.test.mjs`), watch
  it fail, then fix it.
- **A claim it misses, or one it invents.** Add the sentence to
  `test/claims.test.mjs`, under `CLAIMS` or `NOT_CLAIMS`. A false alarm is
  worse than a miss: the check stops a working agent, so err towards leaving a
  sentence alone.
- **Another agent's session format.** Codex, Cursor and Copilot can all run a
  turn-end hook. Each needs a reader that turns its log or its tool hooks into
  the events in `lib/transcript.mjs`.

## Running the tests

```bash
node --test
```

No dependencies, nothing to install. Tests never touch the network, and every
session log they use is built in code by `test/helpers.mjs`; none is copied
from a real session. Please keep it that way. Real session logs hold people's
code and prompts.

## The benchmark

`bench/` runs real agent sessions and spends real usage, so CI does not run
it. See [bench/README.md](bench/README.md). If you change what the detector
flags, re-score an existing run with `node bench/score.mjs <dir>` and say in
the PR what moved.
