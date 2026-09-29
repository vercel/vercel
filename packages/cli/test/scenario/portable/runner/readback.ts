/** Reads the sandbox back into `world.local` after a run. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ScenarioSandbox } from '../../harness/run-cli';
import { isJsonObject, type Json } from '../model/json';
import type { LocalState } from '../model/schemas';
import { IMPLEMENTATION_PRIVATE_FILES, LOCAL_STATE_FILES } from './materialize';

export interface ReadBack {
  local: Record<keyof LocalState, Record<string, Json> | null>;
  /** Read-back failures: unmodeled files, unparsable JSON, non-objects. */
  problems: string[];
}

const READBACK_ROOTS = ['global-config', 'workspace'];

function listFiles(root: string, relative: string): string[] {
  return readdirSync(join(root, ...relative.split('/'))).flatMap(entry => {
    const child = `${relative}/${entry}`;
    return statSync(join(root, ...child.split('/'))).isDirectory()
      ? listFiles(root, child)
      : [child];
  });
}

export function readBackLocal(sandbox: ScenarioSandbox): ReadBack {
  const problems: string[] = [];
  const modeled = new Map(
    Object.entries(LOCAL_STATE_FILES).map(([key, file]) => [
      file,
      key as keyof LocalState,
    ])
  );
  const local: ReadBack['local'] = {
    credentials: null,
    settings: null,
    projectLink: null,
    repoLink: null,
  };

  for (const file of READBACK_ROOTS.flatMap(root =>
    listFiles(sandbox.root, root)
  )) {
    if (IMPLEMENTATION_PRIVATE_FILES.includes(file)) continue;
    const key = modeled.get(file);
    if (!key) {
      problems.push(`unmodeledFile: ${file}`);
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(
        readFileSync(join(sandbox.root, ...file.split('/')), 'utf8')
      );
    } catch (error) {
      problems.push(`${file}: invalid JSON (${(error as Error).message})`);
      continue;
    }
    if (!isJsonObject(value)) {
      problems.push(`${file}: expected a JSON object`);
      continue;
    }
    if (key === 'credentials') {
      // `//` keys are human comments the CLI writes into auth.json.
      value = Object.fromEntries(
        Object.entries(value).filter(([name]) => !name.startsWith('//'))
      );
    }
    local[key] = value as Record<string, Json>;
  }

  return { local, problems };
}
