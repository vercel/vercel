import { homedir } from 'os';
import fs from 'fs';
import path from 'path';
import XDGAppPaths from 'xdg-app-paths';
import getArgs from '../../util/get-args';

// Returns whether a directory exists
export const isDirectory = (path: string): boolean => {
  try {
    return fs.lstatSync(path).isDirectory();
  } catch (_) {
    // We don't care which kind of error occured, it isn't a directory anyway.
    return false;
  }
};

// Returns in which directory the config should be present
const getGlobalPathConfig = (): string => {
  let customPath: string | undefined;

  try {
    const argv = getArgs(process.argv.slice(2), {});
    customPath = argv['--global-config'];
  } catch (_error) {
    // args are optional so consume error
  }

  const vercelDirectories = XDGAppPaths('com.vercel.cli').dataDirs();

  const possibleConfigPaths = [
    ...vercelDirectories, // latest vercel directory
    path.join(homedir(), '.now'), // legacy config in user's home directory
    ...XDGAppPaths('now').dataDirs(), // legacy XDG directory
  ];

  // The customPath flag is the preferred location,
  // followed by the the vercel directory,
  // followed by the now directory.
  // If none of those exist, use the vercel directory.
  return (
    (customPath && path.resolve(customPath)) ||
    possibleConfigPaths.find(configPath => isDirectory(configPath)) ||
    vercelDirectories[0]
  );
};

export default getGlobalPathConfig;
