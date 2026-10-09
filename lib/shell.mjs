// Just enough shell parsing to read the commands a coding agent runs: split a
// command line into the commands it chains, remember the operator after each,
// and find where output is redirected. It respects quotes, escapes, `$(...)`
// and heredocs, and it does not try to be a shell.

const OPERATORS = ['&&', '||', '|&', ';', '|', '&', '\n'];

/**
 * Split a command line into segments.
 * @param {string} line
 * @returns {{text: string, op: string|null}[]} each segment and the operator
 *   that follows it (`null` for the last one). A newline counts as `;`.
 */
export function segments(line) {
  const out = [];
  let buf = '';
  let quote = null;
  let depth = 0; // inside $( ... ) or ` ... `
  let backtick = false;
  const heredocs = []; // delimiters waiting for the end of this line

  const push = (op) => {
    if (buf.trim()) out.push({ text: buf.trim(), op });
    buf = '';
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      buf += ch;
      if (ch === '\\' && quote === '"' && i + 1 < line.length) buf += line[++i];
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\\' && i + 1 < line.length) {
      if (line[i + 1] === '\n') { i++; buf += ' '; continue; }
      buf += ch + line[++i];
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; buf += ch; continue; }
    if (ch === '`') { backtick = !backtick; buf += ch; continue; }
    if (ch === '$' && line[i + 1] === '(') { depth++; buf += '$('; i++; continue; }
    if (ch === ')' && depth > 0) { depth--; buf += ch; continue; }
    if (depth > 0 || backtick) { buf += ch; continue; }

    if (ch === '<' && line[i + 1] === '<' && line[i + 2] !== '<') {
      const m = /^<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/.exec(line.slice(i));
      if (m) {
        heredocs.push(m[2]);
        buf += m[0];
        i += m[0].length - 1;
        continue;
      }
    }
    if (ch === '\n' && heredocs.length) {
      // The body of each pending heredoc follows this newline. It is data,
      // not commands, so skip it.
      let j = i + 1;
      while (heredocs.length && j <= line.length) {
        const end = line.indexOf('\n', j);
        const row = line.slice(j, end === -1 ? line.length : end);
        j = end === -1 ? line.length + 1 : end + 1;
        if (row.trim() === heredocs[0]) heredocs.shift();
      }
      heredocs.length = 0;
      push(';');
      i = j - 1;
      continue;
    }
    // `2>&1` and `>&2` are redirections, not the background operator.
    if (ch === '&' && (line[i - 1] === '>' || line[i + 1] === '>')) { buf += ch; continue; }
    const op = OPERATORS.find((o) => line.startsWith(o, i));
    if (op) {
      push(op === '\n' ? ';' : op);
      i += op.length - 1;
      continue;
    }
    buf += ch;
  }
  push(null);
  if (out.length) {
    const last = out[out.length - 1];
    if (last.op === ';') last.op = null;
  }
  return out;
}

/**
 * The words of one segment, with quotes removed. Good enough to read a
 * program name and its arguments; not a full shell word splitter.
 * @param {string} text
 * @returns {string[]}
 */
export function words(text) {
  const out = [];
  let buf = '';
  let quote = null;
  let any = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      if (ch === '\\' && quote === '"' && i + 1 < text.length) { buf += text[++i]; continue; }
      buf += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; any = true; continue; }
    if (ch === '\\' && i + 1 < text.length) { buf += text[++i]; any = true; continue; }
    if (/\s/.test(ch)) {
      if (buf || any) out.push(buf);
      buf = '';
      any = false;
      continue;
    }
    buf += ch;
  }
  if (buf || any) out.push(buf);
  return out;
}

/**
 * Files a segment writes to through `>`, `>>` or `2>`, excluding descriptors
 * (`2>&1`), anything under /dev, and globs. Quotes are respected, so the
 * arrow in `console.log("a -> b")` is not a redirection.
 * @param {string} text
 * @returns {string[]}
 */
export function redirectTargets(text) {
  const targets = [];
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\\') { i++; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch !== '>') continue;
    if (text[i - 1] === '<' || text[i + 1] === '(') continue; // <>, >(process substitution)
    let j = i + 1;
    if (text[j] === '>') j++;
    if (text[j] === '|') j++;
    while (text[j] === ' ' || text[j] === '\t') j++;
    if (text[j] === '&') { i = j; continue; } // >&2, 2>&1
    // Read one word, honouring quotes.
    let word = '';
    let q = null;
    for (; j < text.length; j++) {
      const c = text[j];
      if (q) { if (c === q) { q = null; continue; } word += c; continue; }
      if (c === "'" || c === '"') { q = c; continue; }
      if (/[\s;&|<>()]/.test(c)) break;
      word += c;
    }
    i = j - 1;
    if (word && !word.startsWith('/dev/') && !/[*?[]/.test(word)) targets.push(word);
  }
  return targets;
}
