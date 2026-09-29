import { resolve } from 'path';
import type { WorkingDirectory } from '../../src/gateways/working-directory';

/** In-memory working directory. Never touches `process.cwd()`. */
export class FakeWorkingDirectory implements WorkingDirectory {
  #cwd: string;

  constructor({ cwd }: { cwd: string }) {
    this.#cwd = resolve(cwd);
  }

  current(): string {
    return this.#cwd;
  }

  change({ dir }: { dir: string }): void {
    this.#cwd = resolve(this.#cwd, dir);
  }
}
