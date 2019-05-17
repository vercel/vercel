import ua from 'universal-analytics';
import { platform, release, userInfo } from 'os'
import crypto from 'crypto';
import * as userAgent from './ua.ts'

export default (GA_TRACKING_ID, configToken) => {
  const token = typeof configToken === 'string' ? configToken : platform() + release();
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
