import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, rmSync} from 'node:fs';
import { join } from 'node:path';

const TEST_TIMEOUT_MS = 60_000;
const RUN_TIMEOUT_MS = 300_000;

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major !== 24 || minor < 7) {
  console.error(`run-tests: cần Node >=24.7 <25, đang dùng ${process.version}`);
  process.exit(1);
}

const root = join(import.meta.dirname, '..');
const resultsDir = join(root, 'test-results');
const junitFile = join(resultsDir, 'node-tests.xml');
rmSync(resultsDir, {recursive: true, force: true});
mkdirSync(resultsDir, {recursive: true});

const testsDir = join(root, 'tests');
const files = existsSync(testsDir)
  ? readdirSync(testsDir, {recursive: true})
      .map(String)
      .filter((name) => name.endsWith('.test.ts'))
      .map((name) => join('tests', name))
      .sort()
  : [];
if (files.length === 0) {
  console.error('run-tests: NO_TESTS_FOUND — không có file tests/**/*.test.ts');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    '--experimental-strip-types',
    '--test',
    '--test-concurrency=1',
    `--test-timeout=${TEST_TIMEOUT_MS}`,
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=junit',
    `--test-reporter-destination=${junitFile}`,
    ...files,
  ],
  {cwd: root, stdio: 'inherit', timeout: RUN_TIMEOUT_MS, killSignal: 'SIGKILL'},
);

if (result.error?.code === 'ETIMEDOUT') {
  console.error(`run-tests: TIMEOUT — node --test chạy quá ${RUN_TIMEOUT_MS} ms và đã bị SIGKILL (kiểm tra server, timer hoặc socket chưa đóng; tiến trình con của file test bị treo có thể vẫn chạy với PPID 1, cần tự kill)`);
  process.exit(1);
}
if (result.error) {
  console.error(`run-tests: không chạy được node --test: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  console.error(`run-tests: node --test bị dừng bởi ${result.signal}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
