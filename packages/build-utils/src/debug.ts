import { getPlatformEnv } from './get-platform-env.js';

export default function debug(message: string, ...additional: any[]) {
  if (getPlatformEnv('BUILDER_DEBUG')) {
    console.log(message, ...additional);
  } else if (process.env.VERCEL_DEBUG_PREFIX) {
    console.log(`${process.env.VERCEL_DEBUG_PREFIX}${message}`, ...additional);
  }
}
