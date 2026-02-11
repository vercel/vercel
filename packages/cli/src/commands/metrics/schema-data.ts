import type { EventDef, DimensionDef, MeasureDef } from './types';

export const EVENTS: EventDef[] = [
  { name: 'incomingRequest', label: 'Edge Requests' },
  { name: 'serverlessFunctionInvocation', label: 'Function Invocations' },
  { name: 'functionExecution', label: 'Function Executions' },
  { name: 'middlewareInvocation', label: 'Middleware Invocations' },
  { name: 'edgeFunctionInvocation', label: 'Edge Function Invocations' },
  { name: 'outgoingRequest', label: 'External APIs' },
  { name: 'isrOperation', label: 'ISR Operations' },
  { name: 'imageTransformation', label: 'Image Transformations' },
  { name: 'vdcOperation', label: 'Cache Operations' },
  { name: 'aiGatewayRequest', label: 'AI Gateway Requests' },
  { name: 'firewallAction', label: 'Firewall Actions' },
  { name: 'workflowOperation', label: 'Workflow Operations' },
];

// Common dimensions shared across multiple events
const commonRequestDimensions: DimensionDef[] = [
  {
    name: 'requestPath',
    label: 'Request Path',
    type: 'string',
    highCardinality: true,
  },
  { name: 'requestMethod', label: 'Request Method', type: 'string' },
  { name: 'requestHostname', label: 'Request Hostname', type: 'string' },
  { name: 'route', label: 'Route', type: 'string', highCardinality: true },
  { name: 'httpStatus', label: 'HTTP Status', type: 'number' },
  { name: 'errorCode', label: 'Error Code', type: 'string' },
  {
    name: 'errorMessage',
    label: 'Error Message',
    type: 'string',
    highCardinality: true,
  },
  { name: 'environment', label: 'Environment', type: 'string' },
  { name: 'deploymentId', label: 'Deployment ID', type: 'string' },
];

const infrastructureDimensions: DimensionDef[] = [
  { name: 'edgeNetworkRegion', label: 'Edge Network Region', type: 'string' },
  { name: 'functionRegion', label: 'Function Region', type: 'string' },
  { name: 'runtime', label: 'Runtime', type: 'string' },
  { name: 'pathType', label: 'Path Type', type: 'string' },
  { name: 'functionStartType', label: 'Function Start Type', type: 'string' },
];

const clientDimensions: DimensionDef[] = [
  {
    name: 'clientIp',
    label: 'Client IP',
    type: 'string',
    highCardinality: true,
  },
  { name: 'clientIpCountry', label: 'Client IP Country', type: 'string' },
  {
    name: 'clientUserAgent',
    label: 'Client User Agent',
    type: 'string',
    highCardinality: true,
  },
  {
    name: 'referrerUrl',
    label: 'Referrer URL',
    type: 'string',
    highCardinality: true,
  },
  { name: 'referrerHostname', label: 'Referrer Hostname', type: 'string' },
];

const cacheDimensions: DimensionDef[] = [
  { name: 'cacheResult', label: 'Cache Result', type: 'string' },
  { name: 'cacheHitState', label: 'Cache Hit State', type: 'string' },
  { name: 'cacheHitLevel', label: 'Cache Hit Level', type: 'string' },
];

export const DIMENSIONS: Record<string, DimensionDef[]> = {
  incomingRequest: [
    ...commonRequestDimensions,
    ...infrastructureDimensions,
    ...clientDimensions,
    ...cacheDimensions,
  ],
  serverlessFunctionInvocation: [
    ...commonRequestDimensions,
    ...infrastructureDimensions.filter(d => d.name !== 'edgeNetworkRegion'),
    { name: 'functionName', label: 'Function Name', type: 'string' },
  ],
  functionExecution: [
    ...commonRequestDimensions,
    ...infrastructureDimensions.filter(d => d.name !== 'edgeNetworkRegion'),
    { name: 'functionName', label: 'Function Name', type: 'string' },
  ],
  middlewareInvocation: [
    ...commonRequestDimensions,
    ...infrastructureDimensions.filter(
      d => !['functionRegion', 'functionStartType'].includes(d.name)
    ),
  ],
  edgeFunctionInvocation: [
    ...commonRequestDimensions,
    ...infrastructureDimensions.filter(
      d => !['functionRegion', 'functionStartType'].includes(d.name)
    ),
    { name: 'functionName', label: 'Function Name', type: 'string' },
  ],
  outgoingRequest: [
    { name: 'requestHostname', label: 'Request Hostname', type: 'string' },
    {
      name: 'requestPath',
      label: 'Request Path',
      type: 'string',
      highCardinality: true,
    },
    { name: 'requestMethod', label: 'Request Method', type: 'string' },
    { name: 'httpStatus', label: 'HTTP Status', type: 'number' },
    { name: 'errorCode', label: 'Error Code', type: 'string' },
    { name: 'environment', label: 'Environment', type: 'string' },
    { name: 'deploymentId', label: 'Deployment ID', type: 'string' },
  ],
  isrOperation: [
    { name: 'route', label: 'Route', type: 'string', highCardinality: true },
    { name: 'cacheResult', label: 'Cache Result', type: 'string' },
    { name: 'environment', label: 'Environment', type: 'string' },
    { name: 'deploymentId', label: 'Deployment ID', type: 'string' },
    { name: 'functionRegion', label: 'Function Region', type: 'string' },
  ],
  imageTransformation: [
    {
      name: 'sourceImageHostname',
      label: 'Source Image Hostname',
      type: 'string',
    },
    {
      name: 'sourceImagePath',
      label: 'Source Image Path',
      type: 'string',
      highCardinality: true,
    },
    {
      name: 'transformationType',
      label: 'Transformation Type',
      type: 'string',
    },
    { name: 'cacheResult', label: 'Cache Result', type: 'string' },
    { name: 'environment', label: 'Environment', type: 'string' },
    { name: 'deploymentId', label: 'Deployment ID', type: 'string' },
  ],
  vdcOperation: [
    {
      name: 'cacheKey',
      label: 'Cache Key',
      type: 'string',
      highCardinality: true,
    },
    { name: 'cacheResult', label: 'Cache Result', type: 'string' },
    { name: 'operationType', label: 'Operation Type', type: 'string' },
    { name: 'environment', label: 'Environment', type: 'string' },
    { name: 'deploymentId', label: 'Deployment ID', type: 'string' },
  ],
  aiGatewayRequest: [
    { name: 'aiProvider', label: 'AI Provider', type: 'string' },
    { name: 'aiModel', label: 'AI Model', type: 'string' },
    { name: 'route', label: 'Route', type: 'string', highCardinality: true },
    { name: 'httpStatus', label: 'HTTP Status', type: 'number' },
    { name: 'errorCode', label: 'Error Code', type: 'string' },
    { name: 'environment', label: 'Environment', type: 'string' },
    { name: 'deploymentId', label: 'Deployment ID', type: 'string' },
  ],
  firewallAction: [
    { name: 'wafAction', label: 'WAF Action', type: 'string' },
    { name: 'wafRuleId', label: 'WAF Rule ID', type: 'string' },
    {
      name: 'requestPath',
      label: 'Request Path',
      type: 'string',
      highCardinality: true,
    },
    { name: 'requestMethod', label: 'Request Method', type: 'string' },
    {
      name: 'clientIp',
      label: 'Client IP',
      type: 'string',
      highCardinality: true,
    },
    { name: 'clientIpCountry', label: 'Client IP Country', type: 'string' },
    { name: 'environment', label: 'Environment', type: 'string' },
  ],
  workflowOperation: [
    { name: 'workflowId', label: 'Workflow ID', type: 'string' },
    { name: 'workflowName', label: 'Workflow Name', type: 'string' },
    { name: 'operationType', label: 'Operation Type', type: 'string' },
    { name: 'status', label: 'Status', type: 'string' },
    { name: 'errorCode', label: 'Error Code', type: 'string' },
    { name: 'environment', label: 'Environment', type: 'string' },
    { name: 'deploymentId', label: 'Deployment ID', type: 'string' },
  ],
};

// Common measures
const countMeasure: MeasureDef = {
  name: 'count',
  label: 'Count',
  unit: 'count',
  aggregations: ['sum', 'persecond', 'percent'],
};

const requestDurationMeasure: MeasureDef = {
  name: 'requestDurationMs',
  label: 'Request Duration',
  unit: 'milliseconds',
  aggregations: ['avg', 'p50', 'p75', 'p90', 'p95', 'p99', 'min', 'max'],
};

const functionDurationMeasure: MeasureDef = {
  name: 'functionDurationMs',
  label: 'Function Duration',
  unit: 'milliseconds',
  aggregations: ['avg', 'p50', 'p75', 'p90', 'p95', 'p99', 'min', 'max'],
};

export const MEASURES: Record<string, MeasureDef[]> = {
  incomingRequest: [
    countMeasure,
    requestDurationMeasure,
    {
      name: 'ttfbMs',
      label: 'Time to First Byte',
      unit: 'milliseconds',
      aggregations: ['avg', 'p50', 'p95', 'p99', 'min', 'max'],
    },
    {
      name: 'fdtInBytes',
      label: 'Fast Data Transfer In',
      unit: 'bytes',
      aggregations: ['sum', 'avg', 'p95'],
    },
    {
      name: 'fdtOutBytes',
      label: 'Fast Data Transfer Out',
      unit: 'bytes',
      aggregations: ['sum', 'avg', 'p95'],
    },
  ],
  serverlessFunctionInvocation: [
    countMeasure,
    functionDurationMeasure,
    {
      name: 'coldStartDurationMs',
      label: 'Cold Start Duration',
      unit: 'milliseconds',
      aggregations: ['avg', 'p50', 'p95', 'p99', 'min', 'max'],
    },
    {
      name: 'functionDurationGbhr',
      label: 'Function Duration (GB-hr)',
      unit: 'gb-hr',
      aggregations: ['sum', 'avg'],
    },
  ],
  functionExecution: [
    countMeasure,
    functionDurationMeasure,
    {
      name: 'coldStartDurationMs',
      label: 'Cold Start Duration',
      unit: 'milliseconds',
      aggregations: ['avg', 'p50', 'p95', 'p99', 'min', 'max'],
    },
    {
      name: 'functionCpuTimeMs',
      label: 'CPU Time',
      unit: 'milliseconds',
      aggregations: ['sum', 'avg', 'p95', 'p99', 'max'],
    },
    {
      name: 'peakMemoryMb',
      label: 'Peak Memory',
      unit: 'megabytes',
      aggregations: ['avg', 'p95', 'p99', 'max'],
    },
    {
      name: 'provisionedMemoryMb',
      label: 'Provisioned Memory',
      unit: 'megabytes',
      aggregations: ['avg', 'max'],
    },
    {
      name: 'cpuThrottlePercent',
      label: 'CPU Throttle',
      unit: 'percent',
      aggregations: ['avg', 'p95', 'p99', 'max'],
    },
  ],
  middlewareInvocation: [
    countMeasure,
    {
      name: 'executionDurationMs',
      label: 'Execution Duration',
      unit: 'milliseconds',
      aggregations: ['avg', 'p50', 'p95', 'p99', 'min', 'max'],
    },
  ],
  edgeFunctionInvocation: [
    countMeasure,
    {
      name: 'executionDurationMs',
      label: 'Execution Duration',
      unit: 'milliseconds',
      aggregations: ['avg', 'p50', 'p95', 'p99', 'min', 'max'],
    },
    {
      name: 'cpuTimeMs',
      label: 'CPU Time',
      unit: 'milliseconds',
      aggregations: ['sum', 'avg', 'p95', 'p99', 'max'],
    },
  ],
  outgoingRequest: [countMeasure, requestDurationMeasure],
  isrOperation: [
    countMeasure,
    {
      name: 'revalidationDurationMs',
      label: 'Revalidation Duration',
      unit: 'milliseconds',
      aggregations: ['avg', 'p50', 'p95', 'p99', 'min', 'max'],
    },
  ],
  imageTransformation: [
    countMeasure,
    {
      name: 'transformationDurationMs',
      label: 'Transformation Duration',
      unit: 'milliseconds',
      aggregations: ['avg', 'p50', 'p95', 'p99', 'min', 'max'],
    },
    {
      name: 'inputSizeBytes',
      label: 'Input Size',
      unit: 'bytes',
      aggregations: ['sum', 'avg', 'max'],
    },
    {
      name: 'outputSizeBytes',
      label: 'Output Size',
      unit: 'bytes',
      aggregations: ['sum', 'avg', 'max'],
    },
  ],
  vdcOperation: [
    countMeasure,
    {
      name: 'operationDurationMs',
      label: 'Operation Duration',
      unit: 'milliseconds',
      aggregations: ['avg', 'p50', 'p95', 'p99', 'min', 'max'],
    },
    {
      name: 'valueSizeBytes',
      label: 'Value Size',
      unit: 'bytes',
      aggregations: ['sum', 'avg', 'max'],
    },
  ],
  aiGatewayRequest: [
    countMeasure,
    requestDurationMeasure,
    {
      name: 'inputTokens',
      label: 'Input Tokens',
      unit: 'tokens',
      aggregations: ['sum', 'avg', 'max'],
    },
    {
      name: 'outputTokens',
      label: 'Output Tokens',
      unit: 'tokens',
      aggregations: ['sum', 'avg', 'max'],
    },
    {
      name: 'cost',
      label: 'Cost',
      unit: 'usd',
      aggregations: ['sum', 'avg', 'max'],
    },
  ],
  firewallAction: [countMeasure],
  workflowOperation: [
    countMeasure,
    {
      name: 'operationDurationMs',
      label: 'Operation Duration',
      unit: 'milliseconds',
      aggregations: ['avg', 'p50', 'p95', 'p99', 'min', 'max'],
    },
  ],
};

export function getEvent(name: string): EventDef | undefined {
  return EVENTS.find(e => e.name === name);
}

export function getDimensions(eventName: string): DimensionDef[] {
  return DIMENSIONS[eventName] ?? [];
}

export function getMeasures(eventName: string): MeasureDef[] {
  return MEASURES[eventName] ?? [];
}

export function getDimension(
  eventName: string,
  dimensionName: string
): DimensionDef | undefined {
  return getDimensions(eventName).find(d => d.name === dimensionName);
}

export function getMeasure(
  eventName: string,
  measureName: string
): MeasureDef | undefined {
  return getMeasures(eventName).find(m => m.name === measureName);
}
