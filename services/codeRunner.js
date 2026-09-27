// Compiles / runs code snippets with the toolchains installed on the server.
// Each run gets a fresh temp directory, a wall-clock limit and capped output.
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === 'win32';
const PYTHON = process.env.PYTHON_BIN || (IS_WIN ? 'python' : 'python3');
const EXE = IS_WIN ? 'main.exe' : 'main';

const RUN_TIMEOUT = Number(process.env.CODE_RUN_TIMEOUT_MS) || 5000;
const COMPILE_TIMEOUT = Number(process.env.CODE_COMPILE_TIMEOUT_MS) || 20000;
const MAX_OUTPUT = 64 * 1024;
const MAX_CONCURRENT = 4;
let running = 0;

// Java requires the file to be named after its public class
const javaClass = (code) => code.match(/public\s+(?:final\s+)?class\s+([A-Za-z_]\w*)/)?.[1] || 'Main';

const LANGUAGES = {
  javascript: { file: () => 'main.js', run: () => ['node', ['main.js']] },
  typescript: { file: () => 'main.ts', run: () => ['node', ['--experimental-strip-types', '--no-warnings', 'main.ts']] },
  python: { file: () => 'main.py', run: () => [PYTHON, ['-u', 'main.py']] },
  java: {
    file: (code) => `${javaClass(code)}.java`,
    compile: (code) => ['javac', ['-encoding', 'UTF-8', `${javaClass(code)}.java`]],
    run: (code) => ['java', ['-Xss16m', '-cp', '.', javaClass(code)]],
  },
  c: { file: () => 'main.c', compile: () => ['gcc', ['-O2', '-std=c11', 'main.c', '-o', EXE, '-lm']], run: (code, dir) => [path.join(dir, EXE), []] },
  cpp: { file: () => 'main.cpp', compile: () => ['g++', ['-O2', '-std=c++14', 'main.cpp', '-o', EXE]], run: (code, dir) => [path.join(dir, EXE), []] },
  sql: { file: () => 'main.sql', run: () => ['node', ['--no-warnings', path.join(__dirname, 'sqlRunner.cjs'), 'main.sql']] },
};

export const RUNNABLE_LANGUAGES = Object.keys(LANGUAGES);

function exec(cmd, args, { cwd, stdin = '', timeout }) {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    const child = spawn(cmd, args, { cwd, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

    const append = (which, chunk) => {
      const text = chunk.toString();
      if (stdout.length + stderr.length + text.length > MAX_OUTPUT) {
        truncated = true;
        child.kill('SIGKILL');
        return;
      }
      if (which === 'out') stdout += text;
      else stderr += text;
    };
    child.stdout.on('data', (c) => append('out', c));
    child.stderr.on('data', (c) => append('err', c));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);

    child.on('error', (err) => {
      clearTimeout(timer);
      const missing = err.code === 'ENOENT';
      resolve({ stdout, stderr: missing ? `"${cmd}" is not installed on the server (or not on PATH).` : err.message, exitCode: -1, missingTool: missing, time: Date.now() - started });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      if (truncated) stderr += '\n[output truncated at 64 KB]';
      if (timedOut) stderr += `\n[stopped: exceeded ${timeout / 1000}s time limit]`;
      resolve({ stdout, stderr, exitCode, timedOut, time: Date.now() - started });
    });

    child.stdin.on('error', () => {}); // program may exit before reading stdin
    child.stdin.end(stdin);
  });
}

export async function runCode({ language, code = '', stdin = '' }) {
  const spec = LANGUAGES[language];
  if (!spec) return { stage: 'run', exitCode: -1, stdout: '', stderr: `Running ${language} is not supported.`, time: 0 };
  if (running >= MAX_CONCURRENT) return { busy: true };

  running += 1;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'teamcollab-run-'));
  try {
    await fs.writeFile(path.join(dir, spec.file(code)), code, 'utf8');

    if (spec.compile) {
      const [cmd, args] = spec.compile(code, dir);
      const compiled = await exec(cmd, args, { cwd: dir, timeout: COMPILE_TIMEOUT });
      if (compiled.exitCode !== 0) return { stage: 'compile', ...compiled };
    }

    const [cmd, args] = spec.run(code, dir);
    return { stage: 'run', ...(await exec(cmd, args, { cwd: dir, stdin, timeout: RUN_TIMEOUT })) };
  } finally {
    running -= 1;
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
