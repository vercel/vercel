import formatTable from '../../util/format-table';
import indent from '../../util/output/indent';
import type { MetricDetail, MetricListItem } from './types';

export function formatMetricListTable(metrics: MetricListItem[]) {
  return indent(
    formatTable(
      ['Metric', 'Description'],
      ['l', 'l'],
      [{ rows: metrics.map(metric => [metric.id, metric.description]) }]
    ),
    1
  );
}

export function formatMetricsTable(metrics: MetricDetail[]) {
  if (metrics.length === 0) {
    return null;
  }
  const dimensionsByMetric = metrics.map(metric =>
    metric.dimensions.map(dimension => dimension.name)
  );
  const sharedDimensions = dimensionsByMetric[0]!.filter(dimension =>
    dimensionsByMetric.every(metricDimensions =>
      metricDimensions.includes(dimension)
    )
  );

  const rows = metrics.map(metric => {
    const extraDimensions = metric.dimensions
      .map(dimension => dimension.name)
      .filter(dimension => !sharedDimensions.includes(dimension))
      .map(dimension => `+${dimension}`);

    const aggregations = metric.aggregations
      .map(aggregation =>
        aggregation === metric.defaultAggregation
          ? `${aggregation} (default)`
          : aggregation
      )
      .join(', ');

    return {
      metric: metric.id,
      description: metric.description,
      unit: metric.unit,
      aggregations,
      extraDimensions,
    };
  });

  const hasExtraDimensions = rows.some(row => row.extraDimensions.length > 0);

  const tableHeaders = hasExtraDimensions
    ? ['Metric', 'Description', 'Unit', 'Aggregations', 'Dimensions']
    : ['Metric', 'Description', 'Unit', 'Aggregations'];
  const tableRows = rows.map(row =>
    hasExtraDimensions
      ? [
          row.metric,
          row.description,
          row.unit,
          row.aggregations,
          row.extraDimensions.join(', ') || '—',
        ]
      : [row.metric, row.description, row.unit, row.aggregations]
  );

  const sharedDimensionsLine =
    sharedDimensions.length > 0
      ? metrics.length === 1
        ? `Dimensions:\n  ${sharedDimensions.join(', ')}`
        : `Shared dimensions:\n  ${sharedDimensions.join(', ')}`
      : null;

  const table = indent(
    formatTable(
      tableHeaders,
      hasExtraDimensions ? ['l', 'l', 'l', 'l', 'l'] : ['l', 'l', 'l', 'l'],
      [{ rows: tableRows }]
    ),
    1
  );

  return sharedDimensionsLine
    ? `\n${table}\n\n${sharedDimensionsLine}`
    : `\n${table}`;
}
