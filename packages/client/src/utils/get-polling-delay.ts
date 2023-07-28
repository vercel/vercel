import ms from 'ms';

export function getPollingDelay(elapsed: number): number {
  if (elapsed <= ms('15s')) {
    return ms('1s');
  }
  if (elapsed <= ms('1m')) {
    return ms('5s');
  }
  if (elapsed <= ms('5m')) {
    return ms('15s');
  }
  return ms('30s');
}
