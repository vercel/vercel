import { getPlatformEnv } from './index';

export default function debug(message: string, ...additional: any[]) {
  if (getPlatformEnv('BUILDER_DEBUG')) {
    console.log(message, ...additional);
  }
}
