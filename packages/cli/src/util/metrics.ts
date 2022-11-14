import crypto from 'crypto';
import ua from 'universal-analytics';
import { getPlatformEnv } from '@vercel/build-utils';

import userAgent from './ua-browser';
import { GA_TRACKING_ID } from './constants';
import * as configFiles from './config/files';

const config: any = configFiles.getConfigFilePath();

export const shouldCollectMetrics =
  (config.collectMetrics === undefined || config.collectMetrics === true) &&
  getPlatformEnv('CLI_COLLECT_METRICS') !== '0' &&
  GA_TRACKING_ID;

export const metrics = (): ua.Visitor => {
  const token =
    typeof config.token === 'string'
      ? config.token
      : process.platform + process.arch;
  const salt =
    (process.env.USER || '') +
    (process.env.LANG || '') +
    (process.env.SHELL || '');
  const hash = crypto
    .pbkdf2Sync(token, salt, 100, 64, 'sha512')
    .toString('hex')
    .substring(0, 24);

  return ua(GA_TRACKING_ID || '', {
    cid: hash,
    strictCidFormat: false,
    uid: hash,
    headers: {
      'User-Agent': userAgent,
    },
  });
};
