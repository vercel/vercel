import { NowBuildError } from '@vercel/build-utils';
import * as which from 'which';
import { compareMajorMinor } from './utils';

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
    // Select the highest installed version that satisfies a simple prefix or >= constraint
    // Accept forms like ">=3.10", "^3.11", "~3.10", "3.11.*", "3.11", "==3.11"
    const r = constraint.trim();
    const satisfies = (ver: string) => {
      if (!r) return true;
      if (r.startsWith('>=')) {
        const min = r.slice(2).trim();
        return compareMajorMinor(ver, min) >= 0;
      }
      if (r.startsWith('==')) {
        const eq = r.slice(2).trim();
        return ver === eq || ver.startsWith(eq + '.');
      }
      if (r.startsWith('^') || r.startsWith('~')) {
        const base = r.slice(1).trim();
        return ver.startsWith(base + '.') || ver === base;
      }
      if (r.endsWith('.*')) {
        const base = r.slice(0, -2);
        return ver.startsWith(base + '.') || ver === base;
      }
      // Plain "3.11" means that major.minor must match
      if (/^\d+\.\d+$/.test(r)) {
        return ver.startsWith(r + '.') || ver === r;
      }
      return false;
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
