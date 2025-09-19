import { NowBuildError } from '@vercel/build-utils';
import * as which from 'which';

interface PythonVersion {
  version: string;
  pipPath: string;
  pythonPath: string;
  runtime: string;
  discontinueDate?: Date;
}

// The order must be most recent first
const allOptions: PythonVersion[] = [
  {
    version: '3.12',
    pipPath: 'pip3.12',
    pythonPath: 'python3.12',
    runtime: 'python3.12',
  },
  {
    version: '3.11',
    pipPath: 'pip3.11',
    pythonPath: 'python3.11',
    runtime: 'python3.11',
  },
  {
    version: '3.10',
    pipPath: 'pip3.10',
    pythonPath: 'python3.10',
    runtime: 'python3.10',
  },
  {
    version: '3.9',
    pipPath: 'pip3.9',
    pythonPath: 'python3.9',
    runtime: 'python3.9',
  },
  {
    version: '3.6',
    pipPath: 'pip3.6',
    pythonPath: 'python3.6',
    runtime: 'python3.6',
    discontinueDate: new Date('2022-07-18'),
  },
];

function getDevPythonVersion(): PythonVersion {
  // Use the system-installed version of `python3` when running `vercel dev`
  return {
    version: '3',
    pipPath: 'pip3',
    pythonPath: 'python3',
    runtime: 'python3',
  };
}

export function getLatestPythonVersion({
  isDev,
}: {
  isDev?: boolean;
}): PythonVersion {
  if (isDev) {
    return getDevPythonVersion();
  }

  const selection = allOptions.find(isInstalled);
  if (!selection) {
    throw new NowBuildError({
      code: 'PYTHON_NOT_FOUND',
      link: 'http://vercel.link/python-version',
      message: `Unable to find any supported Python versions.`,
    });
  }
  return selection;
}

// Get the Python version that satisfies the constraint
export function getSupportedPythonVersion({
  isDev,
  constraint,
  source,
}: {
  isDev?: boolean;
  constraint?: string;
  source?: string;
}): PythonVersion {
  if (isDev) {
    return getDevPythonVersion();
  }

  let selection = getLatestPythonVersion({ isDev: false });
  const origin = source ? ` detected in ${source}` : '';

  if (typeof constraint === 'string') {
    // Accept range forms like ">=3.10,<4.0", and also "^3.11", "~3.10", "3.11.*", "3.11", "==3.11", "!=3.9".
    const r = constraint.trim();
    const satisfies = (ver: string) => {
      if (!r) return true;
      const parts = r
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const checkPart = (p: string) => {
        if (!p) return true;
        const m = p.match(/^(>=|<=|==|!=|>|<|\^|~)\s*(.+)$/);
        let op: string;
        let rhs: string;
        if (m) {
          op = m[1];
          rhs = m[2].trim();
        } else {
          // No explicit operator: treat as major.minor prefix match
          op = 'plain';
          rhs = p.trim();
        }

        const rhsIsPrefix = rhs.endsWith('.*');
        const rhsBase = rhsIsPrefix ? rhs.slice(0, -2) : rhs;

        switch (op) {
          case '>=':
            return compareVersionStrings(ver, rhsBase) >= 0;
          case '<=':
            return compareVersionStrings(ver, rhsBase) <= 0;
          case '>':
            return compareVersionStrings(ver, rhsBase) > 0;
          case '<':
            return compareVersionStrings(ver, rhsBase) < 0;
          case '==':
            return rhsIsPrefix
              ? ver === rhsBase || ver.startsWith(rhsBase + '.')
              : ver === rhsBase || ver.startsWith(rhsBase + '.');
          case '!=':
            return rhsIsPrefix
              ? !(ver === rhsBase || ver.startsWith(rhsBase + '.'))
              : !(ver === rhsBase || ver.startsWith(rhsBase + '.'));
          case '^':
          case '~':
            return ver === rhsBase || ver.startsWith(rhsBase + '.');
          case 'plain':
            if (/^\d+\.\d+$/.test(rhsBase)) {
              return ver === rhsBase || ver.startsWith(rhsBase + '.');
            }
            if (rhsIsPrefix) {
              return ver === rhsBase || ver.startsWith(rhsBase + '.');
            }
            return false;
          default:
            return false;
        }
      };

      return parts.every(checkPart);
    };
    const candidate = allOptions.find(
      o => isInstalled(o) && satisfies(o.version)
    );
    if (candidate) {
      selection = candidate;
    } else {
      console.warn(
        `Python version "${r}"${origin} is invalid and will be ignored.`
      );
    }
  }

  if (isDiscontinued(selection)) {
    throw new NowBuildError({
      code: 'BUILD_UTILS_PYTHON_VERSION_DISCONTINUED',
      link: 'http://vercel.link/python-version',
      message: `Python version "${selection.version}"${origin} is discontinued and must be upgraded.`,
    });
  }

  if (selection.discontinueDate) {
    const d = selection.discontinueDate.toISOString().split('T')[0];
    console.warn(
      `Error: Python version "${selection.version}"${origin} has reached End-of-Life. Deployments created on or after ${d} will fail to build. http://vercel.link/python-version`
    );
  }

  return selection;
}

function isDiscontinued({ discontinueDate }: PythonVersion): boolean {
  const today = Date.now();
  return discontinueDate !== undefined && discontinueDate.getTime() <= today;
}

function isInstalled({ pipPath, pythonPath }: PythonVersion): boolean {
  return (
    Boolean(which.sync(pipPath, { nothrow: true })) &&
    Boolean(which.sync(pythonPath, { nothrow: true }))
  );
}

// Returns true if a PEP 508-style version marker is satisfied by a Python version.
// Supports:
// - Identifiers: `python_version`, `python_full_version`
// - Operators: >, >=, <, <=, ==, !=
// - Compares only major.minor components (patch is ignored)
// Example Markers:
// - `python_version >= '3.10'`
// - `python_version >= '3.10' and python_version < '3.12'`
// Note: Only evaluates the first two comparisons, e.g. following marker will ignore the third comparison:
// e.g. `python_version >= '3.10' and python_version < '3.12' or python_version == '3.13'`
export function doesPythonVersionSatisfyMarker(
  versionMarker: string,
  pythonVersion: string
): boolean {
  const py = parseMajorMinor(pythonVersion);
  if (!py) return true;

  // Find up to the first two comparisons of python_version/_full_version
  const compRe =
    /\bpython(?:_full)?_version\b\s*([><=!]=|[><=])\s*['"]?(\d+(?:\.\d+)*)['"]?/gi;
  type Comp = { op: string; val: string; start: number; end: number };
  const comps: Comp[] = [];
  let m: RegExpExecArray | null;
  while ((m = compRe.exec(versionMarker)) && comps.length < 2) {
    comps.push({ op: m[1], val: m[2], start: m.index, end: compRe.lastIndex });
  }

  if (comps.length === 0) return true;

  const evalComp = ({ op, val }: Comp): boolean => {
    const cmp = compareVersionStrings(pythonVersion, val);
    switch (op) {
      case '>':
        return cmp > 0;
      case '>=':
        return cmp >= 0;
      case '<':
        return cmp < 0;
      case '<=':
        return cmp <= 0;
      case '==':
        return cmp === 0;
      case '!=':
        return cmp !== 0;
      default:
        return true; // fail open
    }
  };

  if (comps.length === 1) return evalComp(comps[0]);

  const [a, b] = comps;
  const boolRe = /\b(and|or)\b/gi;
  let conj: 'and' | 'or' | null = null;
  let bm: RegExpExecArray | null;
  while ((bm = boolRe.exec(versionMarker))) {
    const idx = bm.index;
    if (idx >= a.end && idx < b.start) {
      conj = (bm[1] || '').toLowerCase() as 'and' | 'or';
      break;
    }
    if (idx >= b.start) break; // past second comparison
  }
  const left = evalComp(a);
  const right = evalComp(b);
  return conj === 'or' ? left || right : left && right;
}

// Parse "3.10" -> [3, 10]
export function parseMajorMinor(v: string): [number, number] | null {
  const m = v.match(/^(\d+)\.(\d+)/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

// Comparator for version strings: "3.9" and "3.11" -> -2
export function compareVersionStrings(va: string, vb: string): number {
  const pa = parseMajorMinor(va);
  const pb = parseMajorMinor(vb);
  if (!pa || !pb) return 0;
  if (pa[0] !== pb[0]) return pa[0] - pb[0];
  return pa[1] - pb[1];
}
