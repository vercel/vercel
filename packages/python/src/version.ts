import { NowBuildError } from '@vercel/build-utils';
import which from 'which';

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
  declaredPythonVersion,
}: {
  isDev?: boolean;
  declaredPythonVersion?: {
    version: string;
    source: 'Pipfile.lock' | 'pyproject.toml';
  };
}): PythonVersion {
  if (isDev) {
    return getDevPythonVersion();
  }

  let selection = getLatestPythonVersion({ isDev: false });

  if (declaredPythonVersion) {
    const { version, source } = declaredPythonVersion;
    const requested = allOptions.find(o => o.version === version);
    if (requested) {
      // If a discontinued version is explicitly requested, error even if not installed
      if (isDiscontinued(requested)) {
        throw new NowBuildError({
          code: 'BUILD_UTILS_PYTHON_VERSION_DISCONTINUED',
          link: 'http://vercel.link/python-version',
          message: `Python version "${requested.version}" detected in ${source} is discontinued and must be upgraded.`,
        });
      }
      // Otherwise, prefer the requested version if installed; fall back to latest installed
      if (isInstalled(requested)) {
        selection = requested;
      } else {
        console.warn(
          `Warning: Python version "${version}" detected in ${source} is not installed and will be ignored. http://vercel.link/python-version`
        );
      }
    } else {
      console.warn(
        `Warning: Python version "${version}" detected in ${source} is invalid and will be ignored. http://vercel.link/python-version`
      );
    }
  }

  if (isDiscontinued(selection)) {
    throw new NowBuildError({
      code: 'BUILD_UTILS_PYTHON_VERSION_DISCONTINUED',
      link: 'http://vercel.link/python-version',
      message: `Python version "${selection.version}" declared in project configuration is discontinued and must be upgraded.`,
    });
  }

  if (selection.discontinueDate) {
    const d = selection.discontinueDate.toISOString().split('T')[0];
    const srcSuffix = declaredPythonVersion
      ? `detected in ${declaredPythonVersion.source}`
      : 'selected by runtime';
    console.warn(
      `Error: Python version "${selection.version}" ${srcSuffix} has reached End-of-Life. Deployments created on or after ${d} will fail to build. http://vercel.link/python-version`
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
