import { NowBuildError } from '@vercel/build-utils';

export async function getHugoUrl(
  version: string,
  platform = process.platform,
  arch = process.arch
): Promise<string> {
  const oses = (
    {
      linux: ['linux'],
      darwin: ['darwin', 'macos'],
      win32: ['windows'],
    } as Record<string, string[]>
  )[platform];
  if (!oses) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  const arches = (
    {
      arm64: ['arm64'],
      x64: ['amd64', '64bit'],
    } as Record<string, string[]>
  )[arch];
  if (!arches) {
    throw new Error(`Unsupported arch: ${arch}`);
  }
  if (platform === 'darwin') {
    arches.push('universal');
    if (arch === 'arm64') {
      // On Mac ARM64, assume Rosetta is available to execute 64-bit binaries
      arches.push('64bit');
    }
  }

  const checksumsUrl = `https://github.com/gohugoio/hugo/releases/download/v${version}/hugo_${version}_checksums.txt`;
  const checksumsRes = await fetch(checksumsUrl);
  if (checksumsRes.status === 404) {
    throw new NowBuildError({
      code: 'STATIC_BUILD_BINARY_NOT_FOUND',
      message: `Version ${version} of Hugo does not exist. Please specify a different one.`,
      link: 'https://vercel.link/framework-versioning',
    });
  }
  const checksumsBody = await checksumsRes.text();
  const checksums = new Map<string, string>();
  for (const line of checksumsBody.trim().split('\n')) {
    const [sha, name] = line.split(/\s+/);
    checksums.set(name, sha);
  }

  const file =
    findFile(checksums.keys(), oses, arches, true) ||
    findFile(checksums.keys(), oses, arches, false);
  if (!file) {
    throw new Error(
      `Could not determine filename for Hugo v${version} for ${platform} / ${arch}`
    );
  }

  return `https://github.com/gohugoio/hugo/releases/download/v${version}/${file}`;
}

function findFile(
  names: Iterable<string>,
  oses: string[],
  arches: string[],
  extended: boolean
): string | null {
  const prefix = `hugo_${extended ? 'extended_' : ''}`;
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith('.tar.gz')) continue;
    const suffix = name.split('_').pop();
    if (!suffix) continue;
    const [os, arch] = suffix
      .replace(/\.(.*)$/, '')
      .toLowerCase()
      .split('-');
    if (oses.includes(os) && arches.includes(arch)) {
      return name;
    }
  }
  return null;
}
