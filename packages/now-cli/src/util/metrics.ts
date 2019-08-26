import crypto from 'crypto';
import ua from 'universal-analytics';
import { platform, release, userInfo } from 'os';

import userAgent from './ua-browser';
import { GA_TRACKING_ID } from './constants';
import * as configFiles from './config/files';

const config: any = configFiles.getConfigFilePath();

export const shouldCollectMetrics = (
  config.collectMetrics === undefined
  || config.collectMetrics === true)
  && process.env.NOW_CLI_COLLECT_METRICS !== '0';

export const metrics = () => {
  const token = typeof config.token === 'string' ? config.token : platform() + release();
  const salt = userInfo().username;
  const hash = crypto.pbkdf2Sync(token, salt, 1000, 64, 'sha512').toString('hex').substring(0, 24);

  return ua(GA_TRACKING_ID, {
    cid: hash,
    strictCidFormat: false,
    uid: hash,
    headers: {
      'User-Agent': userAgent
    }
  });
}
