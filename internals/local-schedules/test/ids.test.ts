import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateScheduleId, scheduleExecutionId } from '../src/ids';

afterEach(() => {
  vi.useRealTimers();
});

describe('schedule IDs', () => {
  it('generates unique prefixed ULIDs even at the same clock time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1789387200000);
    const ids = Array.from({ length: 100 }, () => generateScheduleId());
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^sch_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
      expect(id).toHaveLength(30);
    }
  });
});

describe('execution IDs', () => {
  it.each([
    ['sch', 1789387200000, 'schx_1B7216KAEWVD0G4RWPMB70DACK'],
    ['sch', 1700000000000, 'schx_0DYZM55HG1TVEZ9HSSC2R5KDP6'],
    ['sch_01ARZ3NDEKTSV4RRFFQ69G5FAV', 0, 'schx_2J2XCQDPMAE71M8WJC2DPT7JGX'],
    [
      'sch_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      1789387200123,
      'schx_6WBTWWJ4XCDP964HCDG9H86NFQ',
    ],
    [
      'sch_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      1789387200124,
      'schx_7S5QDHVJ43EWHXJKMB9JRJCGFE',
    ],
  ] as const)('matches the backend vector for %s at %d', (scheduleId, at, expected) => {
    expect(scheduleExecutionId(scheduleId, at)).toBe(expected);
  });

  it('reuses the nominal identity for retries regardless of the current clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1789387200000);
    expect(scheduleExecutionId('sch', 1789387200000)).toBe(
      'schx_1B7216KAEWVD0G4RWPMB70DACK'
    );
    vi.setSystemTime(1789387260000);
    expect(scheduleExecutionId('sch', 1789387200000)).toBe(
      'schx_1B7216KAEWVD0G4RWPMB70DACK'
    );
    expect(scheduleExecutionId('sch_other', 1789387200000)).not.toBe(
      'schx_1B7216KAEWVD0G4RWPMB70DACK'
    );
  });
});
