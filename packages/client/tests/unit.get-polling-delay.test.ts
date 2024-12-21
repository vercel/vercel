import { describe, expect, it } from 'vitest';
import { getPollingDelay } from '../src/utils/get-polling-delay';

describe('getPollingDelay()', () => {
  it('should return 1 second', async () => {
    expect(getPollingDelay(0)).toBe(1000);
    expect(getPollingDelay(1000)).toBe(1000);
    expect(getPollingDelay(3000)).toBe(1000);
    expect(getPollingDelay(5000)).toBe(1000);
    expect(getPollingDelay(8000)).toBe(1000);
    expect(getPollingDelay(9000)).toBe(1000);
    expect(getPollingDelay(10000)).toBe(1000);
    expect(getPollingDelay(13000)).toBe(1000);
    expect(getPollingDelay(15000)).toBe(1000);
  });

  it('should return 5 second', async () => {
    expect(getPollingDelay(15001)).toBe(5000);
    expect(getPollingDelay(16000)).toBe(5000);
    expect(getPollingDelay(23000)).toBe(5000);
    expect(getPollingDelay(36000)).toBe(5000);
    expect(getPollingDelay(59000)).toBe(5000);
    expect(getPollingDelay(60000)).toBe(5000);
  });

  it('should return 15 second', async () => {
    expect(getPollingDelay(60001)).toBe(15000);
    expect(getPollingDelay(80000)).toBe(15000);
    expect(getPollingDelay(100000)).toBe(15000);
    expect(getPollingDelay(200000)).toBe(15000);
    expect(getPollingDelay(250000)).toBe(15000);
    expect(getPollingDelay(300000)).toBe(15000);
  });

  it('should return 30 second', async () => {
    expect(getPollingDelay(300001)).toBe(30000);
    expect(getPollingDelay(400000)).toBe(30000);
    expect(getPollingDelay(1400000)).toBe(30000);
    expect(getPollingDelay(9400000)).toBe(30000);
    expect(getPollingDelay(99400000)).toBe(30000);
  });
});
