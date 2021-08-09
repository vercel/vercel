/**
 * Get example list from extracted folder
 */

import { lstatSync, existsSync, readdirSync } from 'fs';

const exists = (path: string) => existsSync(path);
const isDotFile = (name: string) => name.startsWith('.');
const isDirectory = (path: string) => lstatSync(path).isDirectory();

export function summary(source: string) {
  if (!exists(source) || !isDirectory(source)) {
    return [];
  }

  return readdirSync(source, { withFileTypes: true })
    .filter(d => !isDotFile(d.name))
    .filter(d => d.isDirectory());
}
