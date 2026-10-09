// Print an audit for a person to read.

const LABEL = {
  'no-run': 'no matching check after the last edit',
  failed: 'the last matching check had failed',
  empty: 'the last test run ran no tests',
  partial: 'claimed "all" from a partial run',
  phantom: 'cited a command that never ran',
};

function pct(n, d) {
  if (!d) return '';
  const p = (100 * n) / d;
  return `${p < 1 && p > 0 ? '<1' : Math.round(p)}%`;
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function lpad(s, n) {
  s = String(s);
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

function clip(s, n) {
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function formatAudit(result, { days } = {}) {
  const t = result.totals;
  const out = [];
  const span = days ? `the last ${days} days` : 'all time';
  out.push(`show-your-work audit: ${t.sessions} session${t.sessions === 1 ? '' : 's'}, ${span}`);
  out.push('');
  if (!t.turns) {
    out.push('No final message in these sessions claimed that tests pass, that it builds or that it works.');
    out.push('');
    return out.join('\n');
  }
  const w = String(Math.max(t.claims, t.turns)).length + 1;
  out.push(`${pad('Final messages that claimed a result', 44)}${lpad(t.turns, w)}`);
  out.push(`${pad('Claims in them', 44)}${lpad(t.claims, w)}`);
  out.push(`${pad('  backed by a check after the last edit', 44)}${lpad(t.backed, w)}  ${pct(t.backed, t.claims)}`);
  for (const k of ['no-run', 'failed', 'empty', 'partial']) {
    if (t[k]) out.push(`${pad('  ' + LABEL[k], 44)}${lpad(t[k], w)}  ${pct(t[k], t.claims)}`);
  }
  if (t.phantom) out.push(`${pad('Citing a command that never ran', 44)}${lpad(t.phantom, w)}`);
  out.push('');
  if (result.examples.length) {
    out.push('Most recent unbacked claims:');
    for (const e of result.examples.slice(0, 8)) {
      const v = e.violation;
      const what = v.claim ? `"${clip(v.claim.text, 60)}"` : `\`${clip(v.command, 50)}\``;
      out.push(`  ${e.when}  ${pad(clip(e.project || '', 20), 20)}  ${what}`);
      out.push(`  ${' '.repeat(10)}  ${' '.repeat(20)}  ${LABEL[v.type]}`);
    }
    out.push('');
  }
  out.push('Read locally from your session logs. Nothing was sent anywhere.');
  out.push('');
  return out.join('\n');
}
