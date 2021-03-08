// We intentionally import these types here
// which will fail at compile time if exports
// are not found in the index file

import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  NowRequest,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  NowResponse,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  VercelRequest,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  VercelResponse,
} from './index';
