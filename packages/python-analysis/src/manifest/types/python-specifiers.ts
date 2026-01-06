import type { Pep440Constraint } from '@renovatebot/pep440';

export type UnknownPythonImplementation = {
  implementation: string;
};

export type PythonImplementation =
  | 'cpython'
  | 'pypy'
  | 'pyodide'
  | 'graalpy'
  | UnknownPythonImplementation;

export const PythonImplementation = {
  knownLongNames(): Record<string, PythonImplementation> {
    return {
      python: 'cpython',
      cpython: 'cpython',
      pypy: 'pypy',
      pyodide: 'pyodide',
      graalpy: 'graalpy',
    };
  },

  knownShortNames(): Record<string, PythonImplementation> {
    return { cp: 'cpython', pp: 'pypy', gp: 'graalpy' };
  },

  knownNames(): Record<string, PythonImplementation> {
    return { ...this.knownLongNames(), ...this.knownShortNames() };
  },

  parse(s: string): PythonImplementation {
    const impl = this.knownNames()[s];
    if (impl !== undefined) {
      return impl;
    } else {
      return { implementation: s };
    }
  },

  isUnknown(impl: PythonImplementation): impl is UnknownPythonImplementation {
    return (impl as UnknownPythonImplementation).implementation !== undefined;
  },

  toString(impl: PythonImplementation): string {
    switch (impl) {
      case 'cpython':
        return 'cpython';
      case 'pypy':
        return 'pypy';
      case 'pyodide':
        return 'pyodide';
      case 'graalpy':
        return 'graalpy';
      default:
        return impl.implementation;
    }
  },

  toStringPretty(impl: PythonImplementation): string {
    switch (impl) {
      case 'cpython':
        return 'CPython';
      case 'pypy':
        return 'PyPy';
      case 'pyodide':
        return 'PyIodide';
      case 'graalpy':
        return 'GraalPy';
      default:
        return impl.implementation;
    }
  },
};

export type PythonVariant =
  | 'default'
  | 'debug'
  | 'freethreaded'
  | 'gil'
  | 'freethreaded+debug'
  | 'gil+debug'
  | { type: 'unknown'; variant: string };

export const PythonVariant = {
  parse(s: string): PythonVariant {
    switch (s) {
      case 'default':
        return 'default';
      case 'd':
      case 'debug':
        return 'debug';
      case 'freethreaded':
        return 'freethreaded';
      case 't':
        return 'freethreaded';
      case 'gil':
        return 'gil';
      case 'freethreaded+debug':
        return 'freethreaded+debug';
      case 'td':
        return 'freethreaded+debug';
      case 'gil+debug':
        return 'gil+debug';
      default:
        return { type: 'unknown', variant: s };
    }
  },

  toString(v: PythonVariant): string {
    switch (v) {
      case 'default':
        return 'default';
      case 'debug':
        return 'debug';
      case 'freethreaded':
        return 'freethreaded';
      case 'gil':
        return 'gil';
      case 'freethreaded+debug':
        return 'freethreaded+debug';
      case 'gil+debug':
        return 'gil+debug';
      default:
        return v.variant;
    }
  },
};

export interface PythonRequest {
  implementation?: PythonImplementation;
  version?: PythonVersionRequest;
  platform?: PythonPlatformRequest;
}

export interface PythonPlatformRequest {
  os?: string;
  arch?: string;
  libc?: string;
}

export interface PythonVersionRequest {
  constraint: Pep440Constraint[];
  variant?: PythonVariant;
}

/**
 * A Python version constraint with its source.
 *
 * Represents a requirement for a specific Python version range,
 * along with information about where the constraint originated.
 */
export interface PythonConstraint {
  /** The Python version request(s) that define this constraint. */
  request: PythonRequest[];
  /** Human-readable description of where this constraint came from. */
  source: string;
}

export type PythonVersion = {
  major: number;
  minor: number;
  patch?: number;
  prerelease?: string;
};

export const PythonVersion = {
  toString(version: PythonVersion): string {
    let verstr = `${version.major}.${version.minor}`;
    if (version.patch !== undefined) {
      verstr = `${verstr}.${version.patch}`;
    }
    if (version.prerelease !== undefined) {
      verstr = `${verstr}${version.prerelease}`;
    }
    return verstr;
  },
};

export type PythonBuild = {
  version: PythonVersion;
  implementation: PythonImplementation;
  variant: PythonVariant;
  os: string;
  architecture: string;
  libc: string;
};

export const PythonBuild = {
  toString(build: PythonBuild): string {
    const parts = [
      PythonImplementation.toString(build.implementation),
      `${PythonVersion.toString(build.version)}+${PythonVariant.toString(build.variant)}`,
      build.os,
      build.architecture,
      build.libc,
    ];
    return parts.join('-');
  },
};
