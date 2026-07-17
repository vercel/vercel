import { describe, expect, it } from 'vitest';
import {
  latestDate,
  availableDates,
  filterTimeseries,
  type LeaderboardTimeseriesRow,
} from '../../../../src/util/ai-gateway/leaderboard';

const rows = [
  ['2026-05-17', 'A', 'requests', 10],
  ['2026-05-18', 'A', 'requests', 30],
  ['2026-05-18', 'B', 'requests', 50],
  ['2026-05-18', 'C', 'spend', 99],
].map(
  ([date, name, metric, share_percent]) =>
    ({
      date,
      name,
      metric,
      share_percent,
      group: 'model',
      modality: 'all',
    }) as LeaderboardTimeseriesRow
);

describe('ai-gateway leaderboard util', () => {
  it('latestDate / availableDates read the day axis', () => {
    expect(latestDate(rows)).toBe('2026-05-18');
    expect(latestDate([])).toBeUndefined();
    expect(availableDates(rows)).toEqual(['2026-05-18', '2026-05-17']);
  });

  it('filterTimeseries picks one metric on one day, ranked by share', () => {
    expect(
      filterTimeseries(rows, { metric: 'requests' }).map(r => r.name)
    ).toEqual(['B', 'A']);
    expect(
      filterTimeseries(rows, { metric: 'requests', date: '2026-05-17' }).map(
        r => r.name
      )
    ).toEqual(['A']);
  });
});
