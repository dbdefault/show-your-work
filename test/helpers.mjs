// Build Claude Code session logs in memory. Every log the tests use is written
// here, line by line; none is copied from a real session.

let n = 0;
const id = () => `toolu_${String(++n).padStart(4, '0')}`;

export class Session {
  constructor(cwd = '/work/app') {
    this.cwd = cwd;
    this.lines = [];
  }

  base(type) {
    return { type, cwd: this.cwd, sessionId: 'test-session', isSidechain: false, timestamp: new Date(1700000000000 + this.lines.length * 1000).toISOString() };
  }

  user(text) {
    this.lines.push({ ...this.base('user'), message: { role: 'user', content: text } });
    return this;
  }

  say(text) {
    this.lines.push({ ...this.base('assistant'), message: { role: 'assistant', content: [{ type: 'text', text }] } });
    return this;
  }

  /** A tool call and its result. */
  tool(name, input, { text = '', isError = false, toolUseResult, background = false } = {}) {
    const tid = id();
    this.lines.push({ ...this.base('assistant'), message: { role: 'assistant', content: [{ type: 'tool_use', id: tid, name, input }] } });
    const tur = toolUseResult ?? (name === 'Bash' ? { stdout: text, stderr: '', interrupted: false, isImage: false, noOutputExpected: false, ...(background ? { backgroundTaskId: 'bg1' } : {}) } : {});
    this.lines.push({
      ...this.base('user'),
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: text, ...(name === 'Bash' ? { is_error: isError } : {}) }] },
      toolUseResult: tur,
    });
    this.lastId = tid;
    return this;
  }

  bash(command, text = '', opts = {}) {
    const exit = opts.exit ?? 0;
    const body = exit ? `Exit code ${exit}\n${text}` : text;
    let tur;
    if (opts.changed) {
      tur = { stdout: text, stderr: '', interrupted: false, isImage: false, noOutputExpected: false, bashEditDiff: { files: opts.changed.map((f) => ({ filePath: f, hunks: [] })), moreFiles: 0, changedFiles: opts.changed } };
    }
    return this.tool('Bash', { command, description: 'run' }, { text: body, isError: exit !== 0, toolUseResult: tur, background: opts.background });
  }

  edit(file) {
    return this.tool('Edit', { file_path: file, old_string: 'a', new_string: 'b' }, { text: `The file ${file} has been updated.` });
  }

  write(file) {
    return this.tool('Write', { file_path: file, content: 'x' }, { text: `File created successfully at: ${file}` });
  }

  notify(toolUseId, status = 'completed', exitCode = 0) {
    this.lines.push({ ...this.base('user'), message: { role: 'user', content: `<task-notification>\n<task-id>b1</task-id>\n<tool-use-id>${toolUseId}</tool-use-id>\n<status>${status}</status>\n<summary>Background command finished (exit code ${exitCode})</summary>\n</task-notification>` } });
    return this;
  }

  sidechain(text) {
    this.lines.push({ ...this.base('assistant'), isSidechain: true, message: { role: 'assistant', content: [{ type: 'text', text }] } });
    return this;
  }

  toString() {
    return this.lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  }
}
