import { truncateEnd } from './truncate';

export default function ellipsis(str: string, length: number) {
  return truncateEnd(str, length, { omission: '…' });
}
