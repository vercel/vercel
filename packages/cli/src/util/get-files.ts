import { staticFiles as staticFilesCore } from '@vercel-internals/cli-builder-integration/get-files';
import output from '../output-manager';

export function staticFiles(
  path: string,
  options: Parameters<typeof staticFilesCore>[1]
) {
  return staticFilesCore(path, options, output);
}
