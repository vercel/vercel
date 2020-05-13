import path from 'path';
import mri from 'mri';
import { InvalidLocalConfig } from '../errors';
import { existsSync } from 'fs';

export default function getLocalPathConfig(prefix: string) {
  const args = mri(process.argv.slice(2), {
    string: ['local-config'],
    alias: {
      'local-config': 'A',
    },
  });

  const customPath = args['local-config'];

  if (customPath && typeof customPath !== 'string') {
    throw new InvalidLocalConfig(customPath);
  }

  const possibleConfigFiles = [
    path.join(prefix, 'vercel.json'),
    path.join(prefix, 'now.json'),
  ];

  return (
    (customPath && path.resolve(prefix, customPath)) ||
    possibleConfigFiles.find(configFile => existsSync(configFile)) ||
    possibleConfigFiles[0]
  );
}
