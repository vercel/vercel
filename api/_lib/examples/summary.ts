/**
 * Get example list from extracted folder
 */

import { existsSync, lstatSync, readdirSync } from 'fs';

const exists = (path: string) => existsSync(path);
const isDotFile = (name: string) => name.startsWith('.');
const isDirectory = (path: string) => lstatSync(path).isDirectory();

export function summary(source: string): string[] {
  if (!exists(source) || !isDirectory(source)) {
    return [];
  }

  return readdirSync(source, { withFileTypes: true })
    .filter(d => !isDotFile(d.name))
    .filter(d => d.isDirectory())
    .map(d => d.name);
}
