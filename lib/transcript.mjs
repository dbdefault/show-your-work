// Read a coding agent's session log into a flat list of events: what the user
// asked, what the agent said, which tools it called and what came back. Only
// Claude Code's JSONL format is read today; the event shape is the same for
// any agent, so another format needs only another reader.

import { readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'str_replace_based_edit_tool', 'apply_patch']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'shell', 'exec_command', 'run_shell_command']);
const DELEGATE_TOOLS = new Set(['Task', 'Agent']);

/** @typedef {{kind:'user', text:string, i:number}
 *  | {kind:'say', text:string, i:number}
 *  | {kind:'call', id:string, tool:string, input:object, i:number, shell?:string, files?:string[], edit?:boolean, delegate?:boolean}
 *  | {kind:'result', id:string, isError:boolean, text:string, i:number, editedPaths:string[], interrupted?:boolean, background?:boolean}
 *  | {kind:'done', id:string, status:string, exitCode:number|null, text:string, i:number}} Event */

/**
 * Read the end of a file: whole if small, else the last `max` bytes from a
 * line boundary. Long sessions can be tens of megabytes; what matters is the
 * recent part.
 */
export function readTail(path, max = 24 * 1024 * 1024) {
  const size = statSync(path).size;
  if (size <= max) return readFileSync(path, 'utf8');
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(max);
    readSync(fd, buf, 0, max, size - max);
    const s = buf.toString('utf8');
    return s.slice(s.indexOf('\n') + 1);
  } finally {
    closeSync(fd);
  }
}

/** Files a shell command changed, as Claude Code recorded them. */
function editedPaths(tur) {
  const d = tur && tur.bashEditDiff;
  if (!d || typeof d !== 'object') return [];
  const out = [];
  if (Array.isArray(d.changedFiles)) {
    for (const f of d.changedFiles) {
      if (typeof f === 'string') out.push(f);
      else if (f && typeof f.filePath === 'string') out.push(f.filePath);
    }
  }
  if (!out.length && Array.isArray(d.files)) {
    for (const f of d.files) if (f && typeof f.filePath === 'string') out.push(f.filePath);
  }
  return out;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((b) => (typeof b === 'string' ? b : b && b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n');
}

// Messages Claude Code writes into the user's side that the user did not type.
const SYNTHETIC = /^\s*(?:<command-(?:name|message|args)>|<local-command-(?:stdout|stderr|caveat)>|Caveat: |<system-reminder>|\[Request interrupted|<user-prompt-submit-hook>|This session is being continued)/;

/**
 * Parse Claude Code JSONL text into events.
 * @param {string} jsonl
 * @returns {{events: Event[], cwd: string|null}}
 */
export function parseClaudeCode(jsonl) {
  /** @type {Event[]} */
  const events = [];
  let cwd = null;
  let root = null; // where the session started: the project, for our purposes
  const calls = new Map();
  let i = 0;
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (!o || typeof o !== 'object') continue;
    if (o.isSidechain) continue; // a subagent's own work, reported back through its Task result
    if (typeof o.cwd === 'string') {
      cwd = o.cwd;
      if (!root) root = o.cwd;
    }
    const m = o.message;
    if (o.type === 'user' && m) {
      const c = m.content;
      if (typeof c === 'string') {
        pushUser(c);
        continue;
      }
      if (!Array.isArray(c)) continue;
      const texts = [];
      for (const b of c) {
        if (!b || typeof b !== 'object') continue;
        if (b.type === 'tool_result') {
          const call = calls.get(b.tool_use_id);
          const tur = o.toolUseResult && typeof o.toolUseResult === 'object' ? o.toolUseResult : null;
          const text = textOf(b.content);
          events.push({
            kind: 'result',
            id: b.tool_use_id,
            isError: b.is_error === true,
            text,
            i: i++,
            editedPaths: editedPaths(tur),
            interrupted: !!(tur && tur.interrupted),
            background: !!(tur && tur.backgroundTaskId) || /^Command running in background with ID:/m.test(text),
          });
        } else if (b.type === 'text' && typeof b.text === 'string') {
          texts.push(b.text);
        }
      }
      if (texts.length) pushUser(texts.join('\n'));
      continue;
    }
    if (o.type === 'assistant' && m && Array.isArray(m.content)) {
      for (const b of m.content) {
        if (!b || typeof b !== 'object') continue;
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
          events.push({ kind: 'say', text: b.text, i: i++ });
        } else if (b.type === 'tool_use') {
          const input = b.input && typeof b.input === 'object' ? b.input : {};
          const ev = { kind: 'call', id: b.id, tool: b.name, input, i: i++, cwd: typeof o.cwd === 'string' ? o.cwd : cwd };
          if (SHELL_TOOLS.has(b.name)) ev.shell = String(input.command ?? input.cmd ?? '');
          if (EDIT_TOOLS.has(b.name)) {
            ev.edit = true;
            ev.files = [input.file_path, input.notebook_path, input.path].filter((x) => typeof x === 'string');
          }
          if (DELEGATE_TOOLS.has(b.name)) ev.delegate = true;
          calls.set(b.id, ev);
          events.push(ev);
        }
      }
    }
  }
  return { events, cwd, root };

  function pushUser(text) {
    if (!text || !text.trim()) return;
    // A background command finishing arrives as a notification, not a result.
    const note = /<task-notification>[\s\S]*?<\/task-notification>/.exec(text);
    if (note) {
      const id = /<tool-use-id>([^<]+)<\/tool-use-id>/.exec(note[0]);
      const status = /<status>([^<]+)<\/status>/.exec(note[0]);
      const code = /exit code (\d+)/i.exec(note[0]);
      if (id) {
        events.push({ kind: 'done', id: id[1].trim(), status: status ? status[1].trim() : 'completed', exitCode: code ? Number(code[1]) : null, text: note[0], i: i++ });
      }
      return;
    }
    if (SYNTHETIC.test(text)) return;
    events.push({ kind: 'user', text, i: i++ });
  }
}

/**
 * Read a session file.
 * @param {string} path
 */
export function readSession(path) {
  return parseClaudeCode(readTail(path));
}
