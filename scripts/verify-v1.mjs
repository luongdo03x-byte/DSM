import {execFileSync} from 'node:child_process';
import {appendFileSync, existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

// Số test Node tối thiểu phải pass. Tăng khi thêm test; xóa bớt test thì cổng đỏ.
const MIN_NODE_TESTS = 69;
const REQUIRED_NODE_TESTS = ['v1 acceptance harness', 'http api smoke journey'];
const REQUIRED_E2E_TITLE = 'v1 critical UI journey';
const REQUIRED_SECTIONS = ['Automated implementation gate', 'Critical journey', 'CI baseline (SP1)'];
const NODE_COUNT_KEYS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
const NODE_ZERO_KEYS = ['fail', 'cancelled', 'skipped', 'todo'];
const E2E_ZERO_KEYS = ['unexpected', 'flaky', 'skipped'];

const STATUS_LINE = /^Status: (PASS|LOCAL|CI|NOT_VERIFIED|BLOCKED_EXTERNAL|BLOCKED_LOCAL_ENV)(?: — .+)?$/;
const PASS_EVIDENCE = /^Evidence: https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+ @ [0-9a-f]{40}$/;
const LOCAL_EVIDENCE = /^Evidence: local pnpm verify @ [0-9a-f]{40} \(\d{4}-\d{2}-\d{2}, [^,)]+, node v?24\.\d+\.\d+\)$/;

const NODE_REPORT = 'test-results/node-tests.xml';
const E2E_REPORT = 'test-results/e2e.json';
const ACCEPTANCE_DOC = 'docs/verification/v1-acceptance.md';

const root = join(import.meta.dirname, '..');
const problems = [];

function readRepoFile(relativePath, hint) {
  const file = join(root, relativePath);
  if (!existsSync(file)) {
    problems.push(`${relativePath}: không tìm thấy file (${hint})`);
    return undefined;
  }
  return readFileSync(file, 'utf8');
}

function unescapeXml(value) {
  const entities = {quot: '"', apos: "'", lt: '<', gt: '>', amp: '&'};
  return value.replace(/&(quot|apos|lt|gt|amp);/g, (_, name) => entities[name]);
}

function checkNodeReport() {
  const xml = readRepoFile(NODE_REPORT, 'chạy "pnpm test" trước');
  if (xml === undefined) return undefined;
  const counts = {};
  for (const key of NODE_COUNT_KEYS) {
    const found = [...xml.matchAll(new RegExp(`^\\s*<!-- ${key} (\\d+) -->\\s*$`, 'gm'))];
    if (found.length !== 1) {
      problems.push(`${NODE_REPORT}: cần đúng một comment "<!-- ${key} N -->", tìm thấy ${found.length}`);
      continue;
    }
    counts[key] = Number(found[0][1]);
  }
  for (const key of NODE_ZERO_KEYS) {
    if (counts[key] !== undefined && counts[key] !== 0) problems.push(`${NODE_REPORT}: ${key} = ${counts[key]} (cần 0)`);
  }
  if (counts.pass !== undefined && counts.pass < MIN_NODE_TESTS) {
    problems.push(`${NODE_REPORT}: pass = ${counts.pass} < MIN_NODE_TESTS = ${MIN_NODE_TESTS}`);
  }
  const executed = new Set([...xml.matchAll(/<testcase\b[^>]*?\bname="([^"]*)"/g)].map((match) => unescapeXml(match[1])));
  for (const name of REQUIRED_NODE_TESTS) {
    if (!executed.has(name)) problems.push(`required test not executed: ${name}`);
  }
  return counts.pass;
}

function collectSpecs(suites, out) {
  for (const suite of Array.isArray(suites) ? suites : []) {
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) out.push(spec);
    collectSpecs(suite.suites, out);
  }
  return out;
}

function checkE2eReport() {
  const text = readRepoFile(E2E_REPORT, 'chạy "pnpm test:e2e" sau "pnpm test"');
  if (text === undefined) return undefined;
  let report;
  try {
    report = JSON.parse(text);
  } catch (error) {
    problems.push(`${E2E_REPORT}: JSON không hợp lệ (${error.message})`);
    return undefined;
  }
  const stats = report.stats ?? {};
  if (!Number.isInteger(stats.expected) || stats.expected < 1) {
    problems.push(`${E2E_REPORT}: stats.expected = ${stats.expected} (cần ≥ 1)`);
  }
  for (const key of E2E_ZERO_KEYS) {
    if (stats[key] !== 0) problems.push(`${E2E_REPORT}: stats.${key} = ${stats[key]} (cần 0)`);
  }
  const specs = collectSpecs(report.suites, []).filter((spec) => spec.title === REQUIRED_E2E_TITLE);
  if (specs.length !== 1) {
    problems.push(`required e2e not executed: "${REQUIRED_E2E_TITLE}" (tìm thấy ${specs.length} spec, cần đúng 1)`);
    return stats.expected;
  }
  const spec = specs[0];
  const where = `${E2E_REPORT}: spec "${REQUIRED_E2E_TITLE}"`;
  if (spec.ok !== true) problems.push(`${where}: ok = ${spec.ok} (cần true)`);
  const tests = Array.isArray(spec.tests) ? spec.tests : [];
  if (tests.length === 0) problems.push(`${where}: tests[] rỗng`);
  tests.forEach((test, index) => {
    if (test.expectedStatus !== 'passed') {
      problems.push(`${where}: tests[${index}].expectedStatus = '${test.expectedStatus}' (cần 'passed')`);
    }
    if (test.status !== 'expected') problems.push(`${where}: tests[${index}].status = '${test.status}' (cần 'expected')`);
    const last = Array.isArray(test.results) ? test.results.at(-1) : undefined;
    if (last?.status !== 'passed') {
      problems.push(`${where}: tests[${index}].results[cuối].status = '${last?.status}' (cần 'passed')`);
    }
  });
  return stats.expected;
}

function checkAcceptanceDoc() {
  const text = readRepoFile(ACCEPTANCE_DOC, 'tài liệu nghiệm thu');
  if (text === undefined) return;
  const preamble = [];
  const sections = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) sections.push({title: line.slice(3).trim(), lines: []});
    else (sections.at(-1)?.lines ?? preamble).push(line);
  }
  for (const line of preamble) {
    if (/^(Status|Evidence):/.test(line)) problems.push(`${ACCEPTANCE_DOC}: phần mở đầu không được có dòng "${line}"`);
  }
  for (const section of sections) {
    const where = `${ACCEPTANCE_DOC}: mục "${section.title}"`;
    const statusLines = section.lines.filter((line) => line.startsWith('Status:'));
    if (statusLines.length !== 1) {
      problems.push(`${where}: cần đúng một dòng Status, tìm thấy ${statusLines.length}`);
      continue;
    }
    const match = STATUS_LINE.exec(statusLines[0]);
    if (!match) {
      problems.push(`${where}: dòng Status sai cú pháp: "${statusLines[0]}"`);
      continue;
    }
    const status = match[1];
    if (status === 'PASS' && !section.lines.some((line) => PASS_EVIDENCE.test(line))) {
      problems.push(`${where}: Status PASS thiếu dòng "Evidence: https://github.com/<owner>/<repo>/actions/runs/<id> @ <sha 40 ký tự>"`);
    }
    if (status === 'LOCAL' && !section.lines.some((line) => LOCAL_EVIDENCE.test(line))) {
      problems.push(`${where}: Status LOCAL thiếu dòng "Evidence: local pnpm verify @ <sha 40 ký tự> (<YYYY-MM-DD>, <máy>, node v24.x.y)"`);
    }
  }
  const titles = new Set(sections.map((section) => section.title));
  for (const title of REQUIRED_SECTIONS) {
    if (!titles.has(title)) problems.push(`${ACCEPTANCE_DOC}: thiếu mục "## ${title}"`);
  }
}

function runOrigin() {
  const inCi = process.env.GITHUB_ACTIONS === 'true';
  if (inCi) {
    const names = ['GITHUB_SERVER_URL', 'GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'GITHUB_SHA'];
    const missing = names.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      problems.push(`thiếu biến môi trường CI: ${missing.join(', ')}`);
      return undefined;
    }
    const {GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SHA} = process.env;
    return `CI run ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID} @ ${GITHUB_SHA}`;
  }
  try {
    const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    const sha = git('rev-parse', 'HEAD').trim();
    const tree = git('status', '--porcelain').trim() === '' ? 'clean' : 'dirty';
    return `LOCAL @ ${sha} (${tree}) — không phải bằng chứng CI`;
  } catch (error) {
    problems.push(`không đọc được commit HEAD bằng git: ${error.message.split('\n')[0]}`);
    return undefined;
  }
}

const nodeTests = checkNodeReport();
const e2eTests = checkE2eReport();
checkAcceptanceDoc();
const origin = runOrigin();

if (problems.length > 0) {
  console.error(`verify-v1: FAIL (${problems.length} problem(s))`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const line = `verify-v1: OK (${nodeTests} node tests, ${e2eTests} e2e) — ${origin}`;
console.log(line);
if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}
