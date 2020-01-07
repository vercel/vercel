/**
 * Get example list from extracted folder
 */

import { join } from 'path';
import { lstatSync, readdirSync } from 'fs';

const isDotFile = (name: string) => name.startsWith('.');
const isDirectory = (path: string) => lstatSync(path).isDirectory();

export function summary(source: string) {
  if (!isDirectory(source)) {
    return [];
  }

  return readdirSync(source)
    .filter(name => !isDotFile(name))
    .filter(name => isDirectory(join(source, name)));
}
