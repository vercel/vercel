import fs from 'fs';
import { join } from 'path';
import execa from 'execa';
import debug from './debug';
import FileFsRef from './file-fs-ref';

const isWin = process.platform === 'win32';

/**
 * Run a Python script that only uses the standard library.
 */
export async function runStdlibPyScript(options: {
  scriptName: string;
  pythonPath?: string;
  args?: string[];
  cwd?: string;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { scriptName, pythonPath, args = [], cwd } = options;
  // In built output: ./dist/python.js -> ../lib/python/
  const scriptPath = join(__dirname, '..', 'lib', 'python', `${scriptName}.py`);

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Python script not found: ${scriptPath}`);
  }

  const pythonCmd = pythonPath ?? (isWin ? 'python' : 'python3');

  debug(
    `Running stdlib Python script: ${pythonCmd} ${scriptPath} ${args.join(' ')}`
  );

  try {
    const result = await execa(pythonCmd, [scriptPath, ...args], { cwd });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (err: unknown) {
    const execaErr = err as {
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      exitCode: execaErr.exitCode ?? 1,
      stdout: execaErr.stdout ?? '',
      stderr: execaErr.stderr ?? '',
    };
  }
}

/**
 * Check if a Python file is a valid entrypoint by detecting:
 * - A top-level 'app' callable (Flask, FastAPI, Sanic, WSGI/ASGI, etc.)
 * - A top-level 'handler' class (BaseHTTPRequestHandler subclass)
 */
export async function isPythonEntrypoint(
  file: FileFsRef | { fsPath?: string }
): Promise<boolean> {
  try {
    const fsPath = (file as FileFsRef).fsPath;
    if (!fsPath) return false;

    // skip AST parsing if file doesn't contain app or handler
    const content = await fs.promises.readFile(fsPath, 'utf-8');
    if (
      !content.includes('app') &&
      !content.includes('handler') &&
      !content.includes('Handler')
    ) {
      return false;
    }

    const result = await runStdlibPyScript({
      scriptName: 'ast_parser',
      args: [fsPath],
    });

    return result.exitCode === 0;
  } catch (err) {
    debug(`Failed to check Python entrypoint: ${err}`);
    return false;
  }
}
