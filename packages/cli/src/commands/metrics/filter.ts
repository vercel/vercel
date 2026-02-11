import type { MetricsOptions } from './types';

/**
 * Build OData filter for HTTP status codes.
 * Supports: exact codes (500), ranges (5xx, 4xx), and comma-separated (500,502,503).
 */
export function buildStatusFilter(status: string): string {
  const parts = status.split(',').map(s => s.trim());

  if (parts.length === 1) {
    return buildSingleStatusFilter(parts[0]);
  }

  const conditions = parts.map(part => buildSingleStatusFilter(part));
  return `(${conditions.join(' or ')})`;
}

function buildSingleStatusFilter(status: string): string {
  if (status === '5xx') {
    return 'httpStatus ge 500';
  }
  if (status === '4xx') {
    return 'httpStatus ge 400 and httpStatus lt 500';
  }
  if (status === '3xx') {
    return 'httpStatus ge 300 and httpStatus lt 400';
  }
  if (status === '2xx') {
    return 'httpStatus ge 200 and httpStatus lt 300';
  }
  if (status === '1xx') {
    return 'httpStatus ge 100 and httpStatus lt 200';
  }

  // Exact status code
  const code = parseInt(status, 10);
  if (!isNaN(code)) {
    return `httpStatus eq ${code}`;
  }

  // Invalid format, return as-is and let the API reject it
  return `httpStatus eq ${status}`;
}

/**
 * Escape single quotes in OData string values.
 */
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Build the complete OData filter from MetricsOptions shortcuts.
 */
export function buildFilter(options: MetricsOptions): string | undefined {
  const conditions: string[] = [];

  if (options.status) {
    conditions.push(buildStatusFilter(options.status));
  }

  if (options.error) {
    conditions.push(`errorCode eq '${escapeODataString(options.error)}'`);
  }

  if (options.path) {
    conditions.push(
      `contains(requestPath, '${escapeODataString(options.path)}')`
    );
  }

  if (options.method) {
    conditions.push(
      `requestMethod eq '${escapeODataString(options.method.toUpperCase())}'`
    );
  }

  if (options.region) {
    const region = escapeODataString(options.region);
    conditions.push(
      `(edgeNetworkRegion eq '${region}' or functionRegion eq '${region}')`
    );
  }

  if (options.environment) {
    conditions.push(
      `environment eq '${escapeODataString(options.environment)}'`
    );
  }

  if (options.deployment) {
    conditions.push(
      `deploymentId eq '${escapeODataString(options.deployment)}'`
    );
  }

  // Raw filter is appended at the end
  if (options.filter) {
    conditions.push(options.filter);
  }

  return conditions.length > 0 ? conditions.join(' and ') : undefined;
}
