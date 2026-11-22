/** A numeric `major.minor` or `major.minor.patch`, as tagged on Docker Hub. */
const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/;

export function isValidVersion(version: string): boolean {
  return (
    VERSION_RE.test(version) &&
    version.split('.').every(n => Number.isSafeInteger(+n))
  );
}
