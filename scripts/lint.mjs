import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const ROOTS = ['apps', 'packages', 'scripts', 'tests'];
const SOURCE_FILE = /\.(ts|tsx|mjs)$/;
const SELF = 'scripts/lint.mjs';
const TEST_DIRS = ['tests/', 'apps/web/tests/'];

const RULES = [
  {
    name: 'rule 1 (placeholder)',
    appliesTo: () => true,
    patterns: [/\b(TODO|FIXME|HACK)\b/],
  },
  {
    name: 'rule 2 (test marker)',
    appliesTo: (file) => TEST_DIRS.some((dir) => file.startsWith(dir)),
    patterns: [
      /\bexpectFailure\b/,
      /\b(skip|todo)\s*:/,
      /\b(test|it|describe)\.(skip|only|todo|fail|fixme)\b/,
    ],
  },
];

function walk(dir, out) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.isFile() && SOURCE_FILE.test(entry.name)) out.push(path.split(sep).join('/'));
  }
  return out;
}

const files = ROOTS.flatMap((root) => walk(root, [])).filter((file) => file !== SELF);
const problems = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const rule of RULES) {
    if (!rule.appliesTo(file)) continue;
    lines.forEach((line, index) => {
      for (const pattern of rule.patterns) {
        const match = line.match(pattern);
        if (match) problems.push(`${file}:${index + 1} ${rule.name}: ${match[0]}`);
      }
    });
  }
}

if (problems.length > 0) {
  console.error(`lint: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
const count = (ext) => files.filter((file) => file.endsWith(ext)).length;
console.log(`lint: ok (${files.length} files: ${count('.ts')} .ts, ${count('.tsx')} .tsx, ${count('.mjs')} .mjs)`);
