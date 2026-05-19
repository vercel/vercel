import os from 'os';
import * as detectLibc from 'detect-libc';

export interface PlatformInfo {
  /** Wheel tag OS name: "manylinux" or "musllinux" */
  osName: string;
  /** Wheel tag arch: "x86_64", "aarch64", etc. */
  archName: string;
  /** Libc major version (glibc major or musl major) */
  osMajor: number;
  /** Libc minor version */
  osMinor: number;
  /** High-level OS for PythonBuild: "linux", "macos", or "windows" */
  os: string;
  /** PEP 508 sys_platform value: "linux", "win32", or "darwin" */
  sysPlatform: string;
  /** High-level libc for PythonBuild: "gnu" or "musl" */
  libc: string;
}

// Map Node.js arch names to uv platform tag arch names
const ARCH_MAP: Record<string, string> = {
  x64: 'x86_64',
  arm64: 'aarch64',
  ia32: 'i686',
  arm: 'armv7l',
  ppc64: 'ppc64le',
  s390x: 's390x',
};

/**
 * Detect the host platform for wheel compatibility checking and build selection.
 *
 * On the Vercel build image (Linux), we use `detect-libc` to get the exact
 * glibc/musl version. For local `vercel build` on non-Linux hosts we fall
 * back to conservative manylinux defaults for wheel tags (since the host
 * doesn't have a Linux libc).
 */
export function detectPlatform(): PlatformInfo {
  const SYS_PLATFORM_MAP: Record<string, string> = {
    linux: 'linux',
    win32: 'win32',
    darwin: 'darwin',
  };
  const OS_MAP: Record<string, string> = {
    linux: 'linux',
    win32: 'windows',
    darwin: 'macos',
  };

  const arch = os.arch();
  const libcFamily = detectLibc.familySync();
  const libcVersion = detectLibc.versionSync();

  const platform: PlatformInfo = {
    osName: 'manylinux',
    archName: ARCH_MAP[arch] || arch,
    osMajor: 2,
    osMinor: 17,
    os: OS_MAP[process.platform] || 'linux',
    sysPlatform: SYS_PLATFORM_MAP[process.platform] || 'linux',
    libc: 'gnu',
  };

  if (libcFamily === detectLibc.MUSL) {
    platform.osName = 'musllinux';
    platform.libc = 'musl';
  }

  if (libcVersion) {
    const parts = libcVersion.split('.');
    platform.osMajor = parseInt(parts[0], 10);
    platform.osMinor = parseInt(parts[1], 10) || 0;
  }

  return platform;
}

/**
 * Return platform info for the Lambda runtime target.
 *
 * Unlike {@link detectPlatform} (which reflects the build host), this
 * returns Linux platform details suitable for the deployment target.
 * Respects `VERCEL_PYTHON_PLATFORM` for architecture overrides.
 */
export function detectTargetPlatform(): PlatformInfo {
  if (process.env.VERCEL_BUILD_IMAGE && process.platform === 'linux') {
    return detectPlatform();
  }

  const envPlatform = process.env.VERCEL_PYTHON_PLATFORM;
  const isArm =
    envPlatform?.startsWith('aarch64') || envPlatform?.startsWith('arm64');

  const platform: PlatformInfo = {
    osName: 'manylinux',
    archName: 'x86_64',
    osMajor: 2,
    osMinor: 17,
    os: 'linux',
    sysPlatform: 'linux',
    libc: 'gnu',
  };

  if (isArm) {
    platform.archName = 'aarch64';
  }

  return platform;
}
