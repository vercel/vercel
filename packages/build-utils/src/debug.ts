import { getPlatformEnv } from './get-platform-env';

export default function debug(message: string, ...additional: any[]) {
  if (getPlatformEnv('BUILDER_DEBUG')) {
    console.log(message, ...additional);
  }
}
