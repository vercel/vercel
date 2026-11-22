// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import { join } from 'path';

export function getFunctionSourcePath(source: {
  output: { path: string };
  service?: string;
}): string {
  return source.service
    ? join('services', source.service, source.output.path)
    : source.output.path;
}
