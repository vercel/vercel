import os from 'os';
import { parse } from 'url';
import { basename, dirname } from 'path';

/**
 * The Serverless Function's working directory (e.g. `/var/task`) is read-only at
 * runtime; only the OS temp dir is writable. Gatsby's query engine opens several
 * LMDB instances lazily on the first request: the datastore, the `caches-lmdb`
 * query/resolver cache (used by e.g. the built-in `dateformat` resolver and
 * `gatsby-plugin-mdx`), and `gatsby-core-utils` storage. The latter two derive
 * their location from `global.__GATSBY.root` (Gatsby >= 5.13) or, as a fallback,
 * `process.cwd()`. Without redirecting these, opening them tries to `mkdir` under
 * the read-only deployment dir and the SSR/DSG request crashes with
 * `ENOENT: ... mkdir '.../.cache/caches-lmdb'`.
 *
 * This must run before the query engine module is imported, because `caches-lmdb`
 * resolves its path at module-load time. Returns the writable root that was
 * applied (the OS temp dir).
 */
export function redirectGatsbyCachesToWritableDir(): string {
  const tmpDir = os.tmpdir();
  // Covers Gatsby 4.x (caches-lmdb keys off `process.cwd()`) and any other
  // cwd-relative cache/storage write.
  process.chdir(tmpDir);
  // Covers Gatsby >= 5.13, where caches-lmdb and gatsby-core-utils storage read
  // `global.__GATSBY.root`. Preserve any existing fields on the object.
  const globalGatsby = global as typeof globalThis & {
    __GATSBY?: { root?: string };
  };
  globalGatsby.__GATSBY = globalGatsby.__GATSBY || {};
  globalGatsby.__GATSBY.root = tmpDir;
  return tmpDir;
}

export function getPageName(url: string, pathPrefix = '') {
  let pathName = (parse(url).pathname || '/').slice(pathPrefix.length);
  const isPageData = pathName.startsWith('/page-data/');
  if (isPageData) {
    // "/page-data/index/page-data.json" -> "/"
    // "/page-data/using-ssr/page-data.json" -> "using-ssr"
    // "/page-data/foo/bar/ssr/page-data.json" -> "foo/bar/ssr"
    pathName = pathName.split('/').slice(2, -1).join('/');
    if (pathName === 'index') {
      pathName = '/';
    }
  } else {
    // "/using-ssr" -> "using-ssr"
    // "/using-ssr/" -> "using-ssr"
    // "/using-ssr/index.html" -> "using-ssr"
    // "/foo/bar/ssr" -> "foo/bar/ssr"
    if (basename(pathName) === 'index.html') {
      pathName = dirname(pathName);
    }
    if (pathName !== '/') {
      // Remove leading and trailing "/"
      pathName = pathName.replace(/(^\/|\/$)/g, '');
    }
  }
  return { isPageData, pathName };
}
