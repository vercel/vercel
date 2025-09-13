import * as fs from 'fs';
import * as path from 'path';
import { debug } from '@vercel/build-utils';
import { Sema } from 'async-sema';

type MetaLike = { isDev?: boolean } | undefined;

const maxConcurrentRmdir = 16;
// limiting tests pruning to an allowlist for now to be safe
const prunablePackages: Set<string> = new Set([
  'pandas',
  'numpy',
  'scipy',
  'sklearn',
  'matplotlib',
  'statsmodels',
  'xarray',
  'skimage',
  'dask',
  'distributed',
  'networkx',
  'sympy',
  'seaborn',
  'numba',
  'pyarrow',
]);

function isPackageTestsPruningEnabled(meta: MetaLike): boolean {
  const raw = process.env.VERCEL_PYTHON_PRUNE_PACKAGES_TESTS;
  if (raw !== undefined) {
    const v = raw.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }
  return !(meta && meta.isDev);
}

async function collectTestsDirs(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [rootDir];

  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      const name = e.name.toLowerCase();

      if (name === 'tests') {
        out.push(full);
        continue;
      }
      if (name === 'testing') {
        // not safe to prune, skip descending
        continue;
      }
      stack.push(full);
    }
  }
  return out;
}

export async function pruneVendorTests(
  vendorAbsPath: string,
  meta?: MetaLike
): Promise<string[]> {
  if (!isPackageTestsPruningEnabled(meta)) {
    debug('Python vendor pruning is disabled');
    return [];
  }

  if (!vendorAbsPath || !fs.existsSync(vendorAbsPath)) {
    debug('Vendor directory not found; skipping pruning');
    return [];
  }

  const packageAllowlist = prunablePackages;

  const allPackageTestDirs: string[] = [];
  for (const pkg of packageAllowlist) {
    const pkgRoot = path.join(vendorAbsPath, pkg);
    if (!fs.existsSync(pkgRoot)) continue;
    const dirs = await collectTestsDirs(pkgRoot);
    allPackageTestDirs.push(...dirs);
  }

  const sema = new Sema(maxConcurrentRmdir);
  const prunedPaths: string[] = [];
  await Promise.all(
    allPackageTestDirs.map(async p => {
      await sema.acquire();
      try {
        await fs.promises.rm(p, { recursive: true, force: true });
        prunedPaths.push(p);
      } catch {
        // ignore failures
      } finally {
        sema.release();
      }
    })
  );

  if (prunedPaths.length > 0) {
    const suffix = prunedPaths.length === 1 ? 'y' : 'ies';
    debug(
      `Pruned ${prunedPaths.length} test director${suffix} from vendor dependencies`
    );
    debug(
      `Examples: ${prunedPaths.slice(0, 3).join(' | ')}${prunedPaths.length > 3 ? ' ...' : ''}`
    );
  }
  return prunedPaths;
}
