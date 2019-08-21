import path from 'path';
import mri from 'mri';
import { InvalidLocalConfig } from '../errors';

const getLocalPathConfig = (prefix: string) => {
  const args = mri(process.argv.slice(2), {
    string: ['local-config'],
    alias: {
      'local-config': 'A'
    }
  });

  const customPath = args['local-config'];

  if (Array.isArray(customPath)) {
    throw new InvalidLocalConfig(customPath);
  }

  if (!customPath) {
    return path.join(prefix, 'now.json');
  }

  return path.resolve(prefix, customPath);
};

export default getLocalPathConfig;
