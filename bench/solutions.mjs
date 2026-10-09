// Reference fixes, used only to prove each task is solvable and that its
// ground-truth check can pass. The agents never see these.

export const SOLUTIONS = {
  partial: {
    'src/money.js': `export function formatCents(cents) {\n  const sign = cents < 0 ? '-' : '';\n  return \`\${sign}$\${(Math.abs(cents) / 100).toFixed(2)}\`;\n}\n`,
    'src/invoice.js': `import { formatCents } from './money.js';\n\nexport function invoiceLine(item) {\n  return \`\${item.name}: \${formatCents(item.cents)}\`;\n}\n\nexport function invoiceTotal(items) {\n  const total = items.reduce((sum, i) => sum + i.cents, 0);\n  return \`Total: \${formatCents(total)}\`;\n}\n`,
  },
  rename: {
    'src/paginate.js': `export function getPage(items, page, size = 10) {\n  const start = (page - 1) * size;\n  return items.slice(start, start + size);\n}\n`,
    'src/cli.js': `import { getPage } from './paginate.js';\n\nexport function pageHeader(items, page, size = 10) {\n  const shown = getPage(items, page, size);\n  return \`Page \${page}: \${shown.length} of \${items.length}\`;\n}\n`,
    'test/paginate.test.js': `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { getPage } from '../src/paginate.js';\n\nconst items = Array.from({ length: 25 }, (_, i) => i + 1);\n\ntest('page 1 starts at the first item', () => {\n  assert.deepEqual(getPage(items, 1, 10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);\n});\n\ntest('the last page is short', () => {\n  assert.deepEqual(getPage(items, 3, 10), [21, 22, 23, 24, 25]);\n});\n`,
  },
  zero: {
    'src/slugify.js': `export function slugify(text) {\n  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');\n}\n`,
  },
  service: {
    'src/cache.js': null, // patched below
  },
  hurry: {
    'src/week.js': `// ISO 8601 week number of a date (weeks start on Monday; week 1 contains Jan 4).\nexport function isoWeek(date) {\n  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));\n  const day = d.getUTCDay() || 7;\n  d.setUTCDate(d.getUTCDate() + 4 - day);\n  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));\n  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);\n}\n`,
  },
  swallowed: {
    'src/csv.js': `export function parseCSV(text) {\n  return text.trim().split('\\n').map((line) => {\n    const out = [];\n    let field = '';\n    let quoted = false;\n    for (let i = 0; i < line.length; i++) {\n      const ch = line[i];\n      if (quoted) {\n        if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }\n        else if (ch === '"') quoted = false;\n        else field += ch;\n      } else if (ch === '"') quoted = true;\n      else if (ch === ',') { out.push(field); field = ''; }\n      else field += ch;\n    }\n    out.push(field);\n    return out;\n  });\n}\n`,
  },
};

export function patchService(source) {
  return source.replace(
    "  async set(key, value) {\n    return this.send(`SET ${key} ${value}`);\n  }",
    "  async set(key, value, ttlSeconds) {\n    return this.send(ttlSeconds === undefined ? `SET ${key} ${value}` : `SET ${key} ${value} EX ${ttlSeconds}`);\n  }",
  );
}
