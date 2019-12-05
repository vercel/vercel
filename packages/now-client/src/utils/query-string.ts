import { URLSearchParams } from 'url';
import { NowClientOptions } from '../types';

export function generateQueryString(clientOptions: NowClientOptions): string {
  const options = new URLSearchParams();

  if (clientOptions.teamId) {
    options.set('teamId', clientOptions.teamId);
  }

  if (clientOptions.force) {
    options.set('forceNew', '1');
  }

  return Array.from(options.entries()).length ? `?${options.toString()}` : '';
}
