// Executes a .sql file against a fresh in-memory SQLite database (Node's built-in node:sqlite)
// and prints the rows of every query as a text table.
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// Split on semicolons that are not inside quotes or comments
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (!quote && ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      cur += '\n';
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') quote = ch;
    if (!quote && ch === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function printTable(rows) {
  if (!rows.length) return console.log('(0 rows)\n');
  const cols = Object.keys(rows[0]);
  const str = (v) => (v === null ? 'NULL' : String(v));
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => str(r[c]).length)));
  const line = (vals) => vals.map((v, i) => v.padEnd(widths[i])).join(' | ');
  console.log(line(cols));
  console.log(widths.map((w) => '-'.repeat(w)).join('-+-'));
  rows.forEach((r) => console.log(line(cols.map((c) => str(r[c])))));
  console.log(`(${rows.length} row${rows.length === 1 ? '' : 's'})\n`);
}

const db = new DatabaseSync(':memory:');
const statements = splitStatements(fs.readFileSync(process.argv[2], 'utf8'));
for (const stmt of statements) {
  try {
    const prepared = db.prepare(stmt);
    if (/^\s*(select|with|pragma|values|explain)\b/i.test(stmt) || /\breturning\b/i.test(stmt)) printTable(prepared.all());
    else {
      const { changes } = prepared.run();
      if (/^\s*(insert|update|delete|replace)\b/i.test(stmt)) console.log(`${changes} row${changes === 1 ? '' : 's'} affected`);
    }
  } catch (err) {
    console.error(`Error in: ${stmt.split('\n')[0].slice(0, 80)}\n  ${err.message}`);
    process.exitCode = 1;
  }
}
