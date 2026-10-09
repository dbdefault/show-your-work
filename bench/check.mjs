// Ground truth: after a session, does the project's full suite pass? Runs the
// task's own check, plus any hidden test, with the stand-in server up when the
// task needs one.

import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TASKS } from './tasks.mjs';
import { startCacheServer } from './fake-cache-server.mjs';

export async function groundTruth(name, dir) {
  const task = TASKS[name];
  let server = null;
  const hidden = join(dir, 'test', 'zz-hidden.test.js');
  try {
    if (task.server) server = await startCacheServer(6399);
    if (task.hiddenTest) {
      mkdirSync(join(dir, 'test'), { recursive: true });
      writeFileSync(hidden, task.hiddenTest);
    }
    const [cmd, args] = task.check;
    const r = await new Promise((resolve) => {
      // Async, so the stand-in server keeps answering while the tests run.
      const child = spawnAsync(cmd, args, dir);
      child.then(resolve);
    });
    const out = r.stdout + r.stderr;
    const tests = Number((/^# tests (\d+)/m.exec(out) || [])[1] || 0);
    const failed = Number((/^# fail (\d+)/m.exec(out) || [])[1] || 0);
    const pass = r.status === 0 && tests > 0 && failed === 0;
    const note = pass ? `${tests} tests pass` : `${failed} of ${tests} tests fail`;
    // Whether the task was done in full is a separate question from whether
    // the tests pass; only the second decides if a "tests pass" was true.
    let done = pass;
    let doneNote = null;
    if (pass && task.extraCheck) {
      const x = spawnSync(process.execPath, ['-e', task.extraCheck], { cwd: dir, encoding: 'utf8', timeout: 30000 });
      if (x.status !== 0) { done = false; doneNote = (x.stderr || 'extra check failed').trim().split('\n')[0]; }
    }
    return { pass, done, tests, failed, note, doneNote };
  } finally {
    if (server) await new Promise((r) => server.close(r));
    rmSync(hidden, { force: true });
  }
}

function spawnAsync(cmd, args, cwd) {
  return new Promise((resolve) => {
    import('node:child_process').then(({ spawn }) => {
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const argv = cmd === 'node' ? ['--test-reporter=tap', ...args] : args;
      const child = spawn(cmd, argv, { cwd, env });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
      child.stdout.on('data', (c) => { stdout += c; });
      child.stderr.on('data', (c) => { stderr += c; });
      child.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
    });
  });
}
