import { execFile, type ExecFileOptions } from 'node:child_process';

// pkg wraps execFile without preserving Node's custom promisify implementation.
// Resolve both output streams explicitly so this also works in the SEA binary.
export function execFileAsync(
  file: string,
  args: string[],
  options: Omit<ExecFileOptions, 'encoding'> & { encoding?: 'utf8' } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { ...options, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }));
        } else {
          resolve({ stdout, stderr });
        }
      }
    );
  });
}
