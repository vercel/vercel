export interface DimensionSchema {
  name: string;
  label: string;
  filterOnly: boolean;
}

export interface MeasureSchema {
  name: string;
  label: string;
  unit: string;
}

export interface EventSchema {
  description: string;
  dimensions: DimensionSchema[];
  measures: MeasureSchema[];
}

const COUNT_AGGREGATIONS = ['sum', 'persecond', 'percent'] as const;

const VALUE_AGGREGATIONS = [
  'sum',
  'persecond',
  'percent',
  'avg',
  'min',
  'max',
  'p75',
  'p90',
  'p95',
  'p99',
  'stddev',
  'unique',
] as const;

// All 24 events from the observability query engine.
// Measures with "cannot be used in rollups" are excluded since the CLI only supports aggregated queries.
export const SCHEMA: Record<string, EventSchema> = {
  aiGatewayRequest: {
    description: 'AI Gateway request events for tracking AI model API usage',
    dimensions: [
      {
        name: 'aiGatewayModelId',
        label: 'AI Gateway Model ID',
        filterOnly: false,
      },
      { name: 'aiModel', label: 'AI Model', filterOnly: false },
      { name: 'aiModelType', label: 'AI Model Type', filterOnly: false },
      { name: 'aiProvider', label: 'AI Provider', filterOnly: false },
      {
        name: 'cachedInputTokensCurrency',
        label: 'Cached Input Tokens Currency',
        filterOnly: true,
      },
      {
        name: 'cacheCreationInputTokensCurrency',
        label: 'Cache Creation Input Tokens Currency',
        filterOnly: true,
      },
      { name: 'costCurrency', label: 'Currency', filterOnly: true },
      { name: 'deploymentId', label: 'Deployment ID', filterOnly: false },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'httpStatus', label: 'HTTP Status', filterOnly: false },
      { name: 'keyId', label: 'Key ID', filterOnly: true },
      { name: 'keyName', label: 'Key Name', filterOnly: true },
      {
        name: 'marketCostCurrency',
        label: 'Market Cost Currency',
        filterOnly: true,
      },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
    ],
    measures: [
      {
        name: 'aiRequestDurationMs',
        label: 'Request Duration',
        unit: 'milliseconds',
      },
      {
        name: 'cacheCreationInputTokens',
        label: 'Cache Creation Tokens',
        unit: 'tokens',
      },
      {
        name: 'cachedInputTokens',
        label: 'Cached Input Tokens',
        unit: 'tokens',
      },
      { name: 'cost', label: 'Cost', unit: 'US dollars' },
      { name: 'count', label: 'Count', unit: 'count' },
      { name: 'inputTokens', label: 'Input Tokens', unit: 'tokens' },
      { name: 'outputTokens', label: 'Output Tokens', unit: 'tokens' },
      {
        name: 'timeToFirstTokenMs',
        label: 'Time to First Token',
        unit: 'milliseconds',
      },
      { name: 'webSearchCallCount', label: 'Web Search Calls', unit: 'count' },
    ],
  },
  analyticsEvent: {
    description: 'Web Analytics custom event tracking',
    dimensions: [
      { name: 'browserName', label: 'Browser', filterOnly: false },
      { name: 'country', label: 'Country', filterOnly: true },
      { name: 'deploymentId', label: 'Deployment ID', filterOnly: true },
      { name: 'deviceId', label: 'Device Id', filterOnly: true },
      { name: 'deviceType', label: 'Device Type', filterOnly: true },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'eventName', label: 'Analytics event name', filterOnly: true },
      { name: 'osName', label: 'Operating System', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      {
        name: 'referrerHostname',
        label: 'Referrer Hostname',
        filterOnly: false,
      },
      { name: 'requestPath', label: 'Request Path', filterOnly: false },
    ],
    measures: [{ name: 'count', label: 'Count', unit: 'count' }],
  },
  analyticsPageview: {
    description: 'Web Analytics pageview tracking',
    dimensions: [
      { name: 'browserName', label: 'Browser', filterOnly: false },
      { name: 'country', label: 'Country', filterOnly: true },
      { name: 'deploymentId', label: 'Deployment ID', filterOnly: true },
      { name: 'deviceId', label: 'Device Id', filterOnly: true },
      { name: 'deviceType', label: 'Device Type', filterOnly: true },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'osName', label: 'Operating System', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      {
        name: 'referrerHostname',
        label: 'Referrer Hostname',
        filterOnly: false,
      },
      { name: 'requestPath', label: 'Request Path', filterOnly: false },
      { name: 'route', label: 'Route', filterOnly: false },
    ],
    measures: [{ name: 'count', label: 'Count', unit: 'count' }],
  },
  blobDataTransfer: {
    description: 'Blob store data transfer operations',
    dimensions: [
      { name: 'cacheHitLevel', label: 'Cache Hit Level', filterOnly: true },
      { name: 'cacheHitState', label: 'Cache Hit State', filterOnly: true },
      { name: 'cacheResult', label: 'Cache Result', filterOnly: false },
      { name: 'clientIp', label: 'IP Address', filterOnly: false },
      { name: 'clientIpCountry', label: 'IP Country', filterOnly: false },
      { name: 'clientUserAgent', label: 'User Agent', filterOnly: false },
      {
        name: 'edgeNetworkRegion',
        label: 'Edge Network Region',
        filterOnly: false,
      },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'httpStatus', label: 'HTTP Status', filterOnly: false },
      { name: 'pathType', label: 'Path Type', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      {
        name: 'referrerHostname',
        label: 'Referrer Hostname',
        filterOnly: false,
      },
      { name: 'referrerUrl', label: 'Referrer URL', filterOnly: false },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
      { name: 'requestId', label: 'Request ID', filterOnly: true },
      { name: 'requestMethod', label: 'Request Method', filterOnly: false },
      { name: 'requestPath', label: 'Request Path', filterOnly: false },
      { name: 'storeId', label: 'Store ID', filterOnly: true },
      { name: 'storeName', label: 'Store', filterOnly: false },
    ],
    measures: [
      { name: 'bdtOutBytes', label: 'Blob Data Transfer', unit: 'bytes' },
      { name: 'count', label: 'Count', unit: 'count' },
    ],
  },
  blobOperation: {
    description: 'Blob store operations including reads writes and deletes',
    dimensions: [
      {
        name: 'blobOperationLevel',
        label: 'Operation Level',
        filterOnly: true,
      },
      { name: 'blobOperationType', label: 'Operation', filterOnly: true },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'storeId', label: 'Store ID', filterOnly: true },
      { name: 'storeName', label: 'Store', filterOnly: false },
    ],
    measures: [{ name: 'count', label: 'Count', unit: 'count' }],
  },
  blobStoreState: {
    description: 'Blob store state metrics including size and object count',
    dimensions: [
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'storeId', label: 'Store ID', filterOnly: true },
      { name: 'storeName', label: 'Store', filterOnly: false },
    ],
    measures: [],
  },
  blockedConnection: {
    description: 'Connections blocked by firewall rules',
    dimensions: [
      { name: 'asnId', label: 'AS Number', filterOnly: false },
      { name: 'asnName', label: 'AS Name', filterOnly: false },
      { name: 'clientIp', label: 'IP Address', filterOnly: false },
      { name: 'clientIpCountry', label: 'IP Country', filterOnly: false },
      { name: 'clientUserAgent', label: 'User Agent', filterOnly: false },
      {
        name: 'edgeNetworkRegion',
        label: 'Edge Network Region',
        filterOnly: false,
      },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'projectName', label: 'Project', filterOnly: false },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
      { name: 'requestPath', label: 'Request Path', filterOnly: false },
      { name: 'route', label: 'Route', filterOnly: false },
      { name: 'wafAction', label: 'WAF Action', filterOnly: false },
      { name: 'wafRuleId', label: 'WAF Rule ID', filterOnly: false },
    ],
    measures: [{ name: 'count', label: 'Count', unit: 'count' }],
  },
  botIdCheck: {
    description: 'Bot identification check results',
    dimensions: [
      { name: 'asnId', label: 'AS Number', filterOnly: false },
      { name: 'asnName', label: 'AS Name', filterOnly: false },
      { name: 'botCheckResult', label: 'BotID', filterOnly: false },
      { name: 'clientIp', label: 'IP Address', filterOnly: false },
      { name: 'clientIpCountry', label: 'IP Country', filterOnly: false },
      { name: 'clientJa4Digest', label: 'JA4 Digest', filterOnly: false },
      { name: 'clientUserAgent', label: 'User Agent', filterOnly: false },
      {
        name: 'deepAnalysisCheck',
        label: 'Deep Analysis Check',
        filterOnly: false,
      },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'projectName', label: 'Project', filterOnly: false },
      { name: 'referrerUrl', label: 'Referrer URL', filterOnly: false },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
      { name: 'requestPath', label: 'Request Path', filterOnly: false },
      { name: 'route', label: 'Route', filterOnly: false },
    ],
    measures: [{ name: 'count', label: 'Count', unit: 'count' }],
  },
  dataCacheEntryOperation: {
    description: 'Individual Vercel Data Cache entry operations',
    dimensions: [
      { name: 'cacheApi', label: 'Cache API', filterOnly: true },
      { name: 'cacheOperation', label: 'Cache Operation', filterOnly: true },
      { name: 'cacheResult', label: 'Cache Result', filterOnly: false },
      {
        name: 'dataCacheRegion',
        label: 'Vercel Data Cache Region',
        filterOnly: true,
      },
      { name: 'deploymentId', label: 'Deployment ID', filterOnly: false },
      { name: 'entryName', label: 'Entry Name', filterOnly: true },
      {
        name: 'entryRevalidateSeconds',
        label: 'Entry Revalidate Lifetime',
        filterOnly: false,
      },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
      { name: 'requestId', label: 'Request ID', filterOnly: true },
    ],
    measures: [{ name: 'count', label: 'Count', unit: 'count' }],
  },
  dataCacheState: {
    description: 'Vercel Data Cache state metrics',
    dimensions: [
      { name: 'cacheApi', label: 'Cache API', filterOnly: true },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
    ],
    measures: [],
  },
  firewallAction: {
    description: 'Firewall actions including blocks challenges and allows',
    dimensions: [
      { name: 'asnId', label: 'AS Number', filterOnly: false },
      { name: 'asnName', label: 'AS Name', filterOnly: false },
      { name: 'clientIp', label: 'IP Address', filterOnly: false },
      { name: 'clientIpCountry', label: 'IP Country', filterOnly: false },
      { name: 'clientJa4Digest', label: 'JA4 Digest', filterOnly: false },
      { name: 'clientUserAgent', label: 'User Agent', filterOnly: false },
      {
        name: 'edgeNetworkRegion',
        label: 'Edge Network Region',
        filterOnly: false,
      },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'projectName', label: 'Project', filterOnly: false },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
      { name: 'requestPath', label: 'Request Path', filterOnly: false },
      { name: 'route', label: 'Route', filterOnly: false },
      { name: 'wafAction', label: 'WAF Action', filterOnly: false },
      { name: 'wafRuleId', label: 'WAF Rule ID', filterOnly: false },
    ],
    measures: [{ name: 'count', label: 'Count', unit: 'count' }],
  },
  functionExecution: {
    description: 'Serverless function execution details',
    dimensions: [
      { name: 'cause', label: 'Cause', filterOnly: false },
      { name: 'deploymentId', label: 'Deployment ID', filterOnly: false },
      {
        name: 'edgeNetworkRegion',
        label: 'Edge Network Region',
        filterOnly: false,
      },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'errorCode', label: 'Error Code', filterOnly: false },
      { name: 'functionRegion', label: 'Function Region', filterOnly: false },
      { name: 'httpStatus', label: 'HTTP Status', filterOnly: false },
      {
        name: 'middlewareAction',
        label: 'Middleware Action',
        filterOnly: false,
      },
      {
        name: 'middlewareActionTarget',
        label: 'Middleware Action Target',
        filterOnly: false,
      },
      { name: 'originHostname', label: 'Function Hostname', filterOnly: false },
      { name: 'originPath', label: 'Function Path', filterOnly: false },
      { name: 'originRoute', label: 'Function Route', filterOnly: false },
      { name: 'pathType', label: 'Path Type', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'projectName', label: 'Project', filterOnly: false },
      { name: 'provider', label: 'Provider', filterOnly: true },
      {
        name: 'referrerHostname',
        label: 'Referrer Hostname',
        filterOnly: false,
      },
      { name: 'referrerUrl', label: 'Referrer URL', filterOnly: false },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
      { name: 'requestMethod', label: 'Request Method', filterOnly: false },
      { name: 'requestPath', label: 'Request Path', filterOnly: false },
      { name: 'route', label: 'Route', filterOnly: false },
      { name: 'runtime', label: 'Runtime', filterOnly: false },
      {
        name: 'serverActionName',
        label: 'Server Action Name',
        filterOnly: false,
      },
    ],
    measures: [
      {
        name: 'coldStartDurationMs',
        label: 'Cold Start Duration',
        unit: 'milliseconds',
      },
      { name: 'count', label: 'Count', unit: 'count' },
      {
        name: 'fotInBytes',
        label: 'Incoming Fast Origin Transfer',
        unit: 'bytes',
      },
      {
        name: 'fotOutBytes',
        label: 'Outgoing Fast Origin Transfer',
        unit: 'bytes',
      },
      {
        name: 'functionCpuTimeMs',
        label: 'Active CPU Time',
        unit: 'milliseconds',
      },
      { name: 'functionDurationMs', label: 'Duration', unit: 'milliseconds' },
      { name: 'peakMemoryMb', label: 'Peak Memory', unit: 'megabytes' },
      {
        name: 'provisionedMemoryMb',
        label: 'Provisioned Memory',
        unit: 'megabytes',
      },
      {
        name: 'requestDurationMs',
        label: 'Request Duration',
        unit: 'milliseconds',
      },
      { name: 'ttfbMs', label: 'Time to First Byte', unit: 'milliseconds' },
    ],
  },
  imageTransformation: {
    description: 'Successful image optimization operations',
    dimensions: [
      { name: 'deploymentId', label: 'Deployment ID', filterOnly: false },
      {
        name: 'edgeFunctionInvocation',
        label: 'Edge Function Invocations',
        filterOnly: true,
      },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'httpStatus', label: 'HTTP Status', filterOnly: false },
      {
        name: 'imageTransformationRegion',
        label: 'Image Optimization Region',
        filterOnly: false,
      },
      { name: 'optimizedFormatMimeType', label: 'Format', filterOnly: false },
      { name: 'optimizedQuality', label: 'Quality', filterOnly: false },
      { name: 'optimizedWidthPixels', label: 'Width', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'projectName', label: 'Project', filterOnly: false },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
      { name: 'sourceImage', label: 'Source Image', filterOnly: true },
      {
        name: 'sourceImageHash',
        label: 'Source Image Hash',
        filterOnly: false,
      },
      {
        name: 'sourceImageHostname',
        label: 'Source Image Hostname',
        filterOnly: false,
      },
      {
        name: 'sourceImagePathname',
        label: 'Source Image Pathname',
        filterOnly: true,
      },
    ],
    measures: [
      { name: 'compressionRatio', label: 'Compression Ratio', unit: 'ratio' },
      { name: 'count', label: 'Count', unit: 'count' },
      { name: 'optimizedSizeBytes', label: 'Optimized Size', unit: 'bytes' },
      {
        name: 'requestDurationMs',
        label: 'Request Duration',
        unit: 'milliseconds',
      },
      { name: 'sizeChangePercent', label: 'Size Change', unit: 'percent' },
      { name: 'sourceSizeBytes', label: 'Source Size', unit: 'bytes' },
    ],
  },
  imageTransformationFailure: {
    description: 'Failed image optimization operations',
    dimensions: [
      { name: 'deploymentId', label: 'Deployment ID', filterOnly: false },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'errorMessage', label: 'Error Message', filterOnly: true },
      { name: 'httpStatus', label: 'HTTP Status', filterOnly: false },
      { name: 'imageSource', label: 'Image Source', filterOnly: true },
      {
        name: 'imageTransformationRegion',
        label: 'Image Optimization Region',
        filterOnly: false,
      },
      { name: 'optimizedFormatMimeType', label: 'Format', filterOnly: false },
      { name: 'optimizedQuality', label: 'Quality', filterOnly: false },
      { name: 'optimizedWidthPixels', label: 'Width', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'projectName', label: 'Project', filterOnly: false },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
      { name: 'sourceImage', label: 'Source Image', filterOnly: true },
      {
        name: 'sourceImageHostname',
        label: 'Source Image Hostname',
        filterOnly: false,
      },
      {
        name: 'sourceImagePathname',
        label: 'Source Image Pathname',
        filterOnly: true,
      },
    ],
    measures: [{ name: 'count', label: 'Count', unit: 'count' }],
  },
  incomingRequest: {
    description: 'All incoming HTTP requests to your deployments',
    dimensions: [
      { name: 'asnId', label: 'AS Number', filterOnly: false },
      { name: 'asnName', label: 'AS Name', filterOnly: false },
      { name: 'botCategory', label: 'Bot Category', filterOnly: false },
      {
        name: 'botCategoryLegacy',
        label: 'Bot Category (Legacy)',
        filterOnly: false,
      },
      { name: 'botName', label: 'Bot Name', filterOnly: false },
      { name: 'botVerified', label: 'Bot Verified', filterOnly: false },
      { name: 'cacheHitLevel', label: 'Cache Hit Level', filterOnly: true },
      { name: 'cacheHitState', label: 'Cache Hit State', filterOnly: true },
      { name: 'cacheResult', label: 'Cache Result', filterOnly: false },
      { name: 'clientIp', label: 'IP Address', filterOnly: false },
      { name: 'clientIpCountry', label: 'IP Country', filterOnly: false },
      { name: 'clientJa4Digest', label: 'JA4 Digest', filterOnly: false },
      { name: 'clientUserAgent', label: 'User Agent', filterOnly: false },
      { name: 'deploymentId', label: 'Deployment ID', filterOnly: false },
      {
        name: 'edgeNetworkRegion',
        label: 'Edge Network Region',
        filterOnly: false,
      },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'errorCode', label: 'Error Code', filterOnly: false },
      {
        name: 'externalRewriteTargetHost',
        label: 'External Rewrite Destination Hostname',
        filterOnly: true,
      },
      {
        name: 'externalRewriteTargetPath',
        label: 'External Rewrite Destination Path',
        filterOnly: true,
      },
      { name: 'httpStatus', label: 'HTTP Status', filterOnly: false },
      { name: 'isrCacheRegion', label: 'ISR Cache Region', filterOnly: false },
      {
        name: 'microfrontendsDefaultAppDeploymentId',
        label: 'Microfrontends Default App Deployment ID',
        filterOnly: true,
      },
      {
        name: 'microfrontendsMatchedPath',
        label: 'Microfrontends Matched Path',
        filterOnly: false,
      },
      {
        name: 'microfrontendsResponseReason',
        label: 'Microfrontends Response Reason',
        filterOnly: false,
      },
      { name: 'pathType', label: 'Path Type', filterOnly: false },
      { name: 'pathTypeVariant', label: 'Path Type Variant', filterOnly: true },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'projectName', label: 'Project', filterOnly: false },
      {
        name: 'redirectLocation',
        label: 'Redirect Location',
        filterOnly: false,
      },
      {
        name: 'referrerHostname',
        label: 'Referrer Hostname',
        filterOnly: false,
      },
      { name: 'referrerUrl', label: 'Referrer URL', filterOnly: false },
      {
        name: 'requestExtension',
        label: 'Request Extension',
        filterOnly: true,
      },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
      { name: 'requestId', label: 'Request ID', filterOnly: true },
      { name: 'requestMethod', label: 'Request Method', filterOnly: false },
      { name: 'requestPath', label: 'Request Path', filterOnly: false },
      {
        name: 'rewriteDestinationHostname',
        label: 'Rewrite Destination Hostname',
        filterOnly: true,
      },
      { name: 'route', label: 'Route', filterOnly: false },
      {
        name: 'serverActionName',
        label: 'Server Action Name',
        filterOnly: false,
      },
      { name: 'skewProtection', label: 'Skew Protection', filterOnly: false },
      { name: 'wafAction', label: 'WAF Action', filterOnly: false },
      { name: 'wafRuleId', label: 'WAF Rule ID', filterOnly: false },
    ],
    measures: [
      { name: 'count', label: 'Count', unit: 'count' },
      {
        name: 'externalRewriteConnectMs',
        label: 'External Rewrite Connect Time',
        unit: 'milliseconds',
      },
      {
        name: 'externalRewriteDnsMs',
        label: 'External Rewrite DNS Time',
        unit: 'milliseconds',
      },
      {
        name: 'fdtInBytes',
        label: 'Fast Data Transfer (Incoming)',
        unit: 'bytes',
      },
      {
        name: 'fdtOutBytes',
        label: 'Fast Data Transfer (Outgoing)',
        unit: 'bytes',
      },
      {
        name: 'fdtTotalBytes',
        label: 'Fast Data Transfer (Total)',
        unit: 'bytes',
      },
      { name: 'isrReadUnits', label: 'Read Units', unit: 'count' },
      { name: 'isrWriteUnits', label: 'Write Units', unit: 'count' },
      {
        name: 'requestDurationMs',
        label: 'Request Duration',
        unit: 'milliseconds',
      },
    ],
  },
  isrOperation: {
    description: 'Incremental Static Regeneration operations',
    dimensions: [
      { name: 'cacheHitLevel', label: 'Cache Hit Level', filterOnly: true },
      { name: 'cacheHitState', label: 'Cache Hit State', filterOnly: true },
      { name: 'cacheResult', label: 'Cache Result', filterOnly: false },
      { name: 'deploymentId', label: 'Deployment ID', filterOnly: false },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'errorCode', label: 'Error Code', filterOnly: false },
      { name: 'httpStatus', label: 'HTTP Status', filterOnly: false },
      { name: 'isrAction', label: 'ISR Action', filterOnly: true },
      { name: 'isrCacheRegion', label: 'ISR Cache Region', filterOnly: false },
      { name: 'pathType', label: 'Path Type', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'projectName', label: 'Project', filterOnly: false },
      {
        name: 'referrerHostname',
        label: 'Referrer Hostname',
        filterOnly: false,
      },
      { name: 'referrerUrl', label: 'Referrer URL', filterOnly: false },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
      { name: 'requestMethod', label: 'Request Method', filterOnly: false },
      { name: 'requestPath', label: 'Request Path', filterOnly: false },
      { name: 'route', label: 'Route', filterOnly: false },
    ],
    measures: [
      { name: 'count', label: 'Count', unit: 'count' },
      { name: 'isrReadBytes', label: 'Read Bandwidth', unit: 'bytes' },
      { name: 'isrReadUnits', label: 'Read Units', unit: 'count' },
      { name: 'isrWriteBytes', label: 'Write Bandwidth', unit: 'bytes' },
      { name: 'isrWriteUnits', label: 'Write Units', unit: 'count' },
    ],
  },
  middlewareInvocation: {
    description: 'Middleware function invocations',
    dimensions: [
      { name: 'clientIp', label: 'IP Address', filterOnly: false },
      { name: 'clientUserAgent', label: 'User Agent', filterOnly: false },
      { name: 'deploymentId', label: 'Deployment ID', filterOnly: false },
      { name: 'durationMs', label: 'Duration', filterOnly: true },
      {
        name: 'edgeNetworkRegion',
        label: 'Edge Network Region',
        filterOnly: false,
      },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'functionRegion', label: 'Function Region', filterOnly: false },
      {
        name: 'functionStartType',
        label: 'Function Start Type',
        filterOnly: false,
      },
      { name: 'httpStatus', label: 'HTTP Status', filterOnly: false },
      {
        name: 'isAdditionalRequest',
        label: 'Is Additional Request',
        filterOnly: true,
      },
      {
        name: 'middlewareAction',
        label: 'Middleware Action',
        filterOnly: false,
      },
      {
        name: 'middlewareActionTarget',
        label: 'Middleware Action Target',
        filterOnly: false,
      },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'projectName', label: 'Project', filterOnly: false },
      {
        name: 'referrerHostname',
        label: 'Referrer Hostname',
        filterOnly: false,
      },
      { name: 'referrerUrl', label: 'Referrer URL', filterOnly: false },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
      { name: 'requestMethod', label: 'Request Method', filterOnly: false },
      { name: 'requestPath', label: 'Request Path', filterOnly: false },
    ],
    measures: [
      { name: 'count', label: 'Count', unit: 'count' },
      { name: 'durationMs', label: 'Duration', unit: 'milliseconds' },
      {
        name: 'fotInBytes',
        label: 'Incoming Fast Origin Transfer',
        unit: 'bytes',
      },
      {
        name: 'fotOutBytes',
        label: 'Outgoing Fast Origin Transfer',
        unit: 'bytes',
      },
      {
        name: 'fotTotalBytes',
        label: 'Total Fast Origin Transfer',
        unit: 'bytes',
      },
      {
        name: 'functionCpuTimeMs',
        label: 'Active CPU Time',
        unit: 'milliseconds',
      },
      {
        name: 'functionDurationGbhr',
        label: 'Duration (Gb-hrs)',
        unit: 'gigabyte hours',
      },
      { name: 'peakMemoryMb', label: 'Peak Memory', unit: 'megabytes' },
      {
        name: 'provisionedMemoryMb',
        label: 'Provisioned Memory',
        unit: 'megabytes',
      },
      { name: 'ttfbMs', label: 'Time to First Byte', unit: 'milliseconds' },
    ],
  },
  outgoingRequest: {
    description: 'External API calls made from your functions',
    dimensions: [
      { name: 'cacheApi', label: 'Cache API', filterOnly: true },
      { name: 'cacheHostname', label: 'Cache Hostname', filterOnly: true },
      { name: 'cachePath', label: 'Cache Path', filterOnly: true },
      { name: 'deploymentId', label: 'Deployment ID', filterOnly: false },
      { name: 'edgeType', label: 'Edge Type', filterOnly: true },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'errorCode', label: 'Error Code', filterOnly: false },
      { name: 'fetchIndex', label: 'Fetch Index', filterOnly: true },
      { name: 'fetchType', label: 'Request Target', filterOnly: false },
      { name: 'functionRegion', label: 'Function Region', filterOnly: false },
      { name: 'httpStatus', label: 'HTTP Status', filterOnly: false },
      { name: 'originHostname', label: 'Function Hostname', filterOnly: false },
      { name: 'originPath', label: 'Function Path', filterOnly: false },
      { name: 'originRoute', label: 'Function Route', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'projectName', label: 'Project', filterOnly: false },
      {
        name: 'reason',
        label: 'Reason of failure for outgoing requests',
        filterOnly: true,
      },
      { name: 'requestApi', label: 'Request API', filterOnly: true },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
      { name: 'requestId', label: 'Request ID', filterOnly: true },
      { name: 'requestMethod', label: 'Request Method', filterOnly: false },
      { name: 'requestPath', label: 'Request Path', filterOnly: false },
      {
        name: 'requestResolvedIp',
        label: 'Resolved Request IP',
        filterOnly: true,
      },
      { name: 'source', label: 'edge vs lambda', filterOnly: true },
    ],
    measures: [
      { name: 'count', label: 'Count', unit: 'count' },
      {
        name: 'requestDurationMs',
        label: 'Time to First Byte',
        unit: 'milliseconds',
      },
    ],
  },
  prReview: {
    description: 'Pull request review operations',
    dimensions: [
      { name: 'commitSha', label: 'Commit SHA', filterOnly: false },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      {
        name: 'pullRequestNumber',
        label: 'Pull Request Number',
        filterOnly: false,
      },
      { name: 'repositoryName', label: 'Repository Name', filterOnly: false },
      { name: 'repositoryOwner', label: 'Repository Owner', filterOnly: false },
      {
        name: 'reviewConclusion',
        label: 'Review Conclusion',
        filterOnly: false,
      },
      { name: 'reviewStatus', label: 'Review Status', filterOnly: false },
    ],
    measures: [
      { name: 'cost', label: 'Cost', unit: 'US dollars' },
      { name: 'count', label: 'Count', unit: 'count' },
      { name: 'filesRead', label: 'Files Read', unit: 'count' },
      { name: 'reviewComments', label: 'Review Comments', unit: 'count' },
      { name: 'reviewTimeSeconds', label: 'Review Time', unit: 'seconds' },
      { name: 'timeWorkedSeconds', label: 'Time Worked', unit: 'seconds' },
      { name: 'tokenCost', label: 'Token Cost', unit: 'count' },
    ],
  },
  prReviewModelUsage: {
    description: 'AI model usage for pull request reviews',
    dimensions: [
      { name: 'aiModel', label: 'AI Model', filterOnly: false },
      { name: 'commitSha', label: 'Commit SHA', filterOnly: false },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      {
        name: 'pullRequestNumber',
        label: 'Pull Request Number',
        filterOnly: false,
      },
      { name: 'repositoryName', label: 'Repository Name', filterOnly: false },
      { name: 'repositoryOwner', label: 'Repository Owner', filterOnly: false },
    ],
    measures: [
      {
        name: 'cacheCreationInputTokens',
        label: 'Cache Creation Tokens',
        unit: 'tokens',
      },
      {
        name: 'cachedInputTokens',
        label: 'Cached Input Tokens',
        unit: 'tokens',
      },
      { name: 'count', label: 'Count', unit: 'count' },
      { name: 'inputTokens', label: 'Input Tokens', unit: 'tokens' },
      { name: 'outputTokens', label: 'Output Tokens', unit: 'tokens' },
      { name: 'tokenCost', label: 'Token Cost', unit: 'count' },
    ],
  },
  queueOperation: {
    description: 'Queue operations for message processing',
    dimensions: [
      { name: 'consumerGroup', label: 'Consumer Group', filterOnly: true },
      { name: 'contentType', label: 'Content Type', filterOnly: true },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'eventType', label: 'Queue Event Type', filterOnly: true },
      { name: 'messageId', label: 'Message ID', filterOnly: true },
      { name: 'notificationUrl', label: 'Notification URL', filterOnly: true },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'queueName', label: 'Queue Name', filterOnly: true },
    ],
    measures: [{ name: 'count', label: 'Count', unit: 'count' }],
  },
  reviewedPrComplete: {
    description: 'Completed pull request review feedback',
    dimensions: [
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      {
        name: 'pullRequestNumber',
        label: 'Pull Request Number',
        filterOnly: false,
      },
      {
        name: 'pullRequestState',
        label: 'Pull Request State',
        filterOnly: false,
      },
      { name: 'repositoryName', label: 'Repository Name', filterOnly: false },
      { name: 'repositoryOwner', label: 'Repository Owner', filterOnly: false },
    ],
    measures: [
      {
        name: 'badReviewComments',
        label: 'Bad Review Comments',
        unit: 'count',
      },
      { name: 'count', label: 'Count', unit: 'count' },
      {
        name: 'feedbackAcceptedCount',
        label: 'Feedback Accepted Count',
        unit: 'count',
      },
      {
        name: 'feedbackIgnoredCount',
        label: 'Feedback Ignored Count',
        unit: 'count',
      },
      {
        name: 'goodReviewComments',
        label: 'Good Review Comments',
        unit: 'count',
      },
      {
        name: 'negativeReviewCommentReactions',
        label: 'Negative Review Comment Reactions',
        unit: 'count',
      },
      {
        name: 'negativeReviewCommentReplyThreads',
        label: 'Negative Review Comment Reply Threads',
        unit: 'count',
      },
      {
        name: 'neutralReviewComments',
        label: 'Neutral Review Comments',
        unit: 'count',
      },
      {
        name: 'positiveReviewCommentReactions',
        label: 'Positive Review Comment Reactions',
        unit: 'count',
      },
      {
        name: 'positiveReviewCommentReplyThreads',
        label: 'Positive Review Comment Reply Threads',
        unit: 'count',
      },
      {
        name: 'suggestionAcceptedCount',
        label: 'Suggestion Accepted Count',
        unit: 'count',
      },
      {
        name: 'suggestionIgnoredCount',
        label: 'Suggestion Ignored Count',
        unit: 'count',
      },
      {
        name: 'totalReviewComments',
        label: 'Total Review Comments',
        unit: 'count',
      },
    ],
  },
  speedInsightsMetric: {
    description: 'Core Web Vitals and performance metrics',
    dimensions: [
      { name: 'browserName', label: 'Browser', filterOnly: false },
      { name: 'country', label: 'Country', filterOnly: true },
      { name: 'deploymentId', label: 'Deployment ID', filterOnly: false },
      { name: 'deviceType', label: 'Device Type', filterOnly: true },
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'osName', label: 'Operating System', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'requestHostname', label: 'Request Hostname', filterOnly: false },
      { name: 'requestPath', label: 'Request Path', filterOnly: false },
      { name: 'route', label: 'Route', filterOnly: false },
    ],
    measures: [
      { name: 'cls', label: 'Cumulative Layout Shift', unit: 'ratio' },
      { name: 'count', label: 'Count', unit: 'count' },
      { name: 'fcp', label: 'First Contentful Paint', unit: 'milliseconds' },
      { name: 'fid', label: 'First Input Delay', unit: 'milliseconds' },
      { name: 'inp', label: 'Interaction to Next Paint', unit: 'milliseconds' },
      { name: 'lcp', label: 'Largest Contentful Paint', unit: 'milliseconds' },
      { name: 'ttfbMs', label: 'Time to First Byte', unit: 'milliseconds' },
    ],
  },
  workflowOperation: {
    description: 'Workflow execution operations',
    dimensions: [
      { name: 'environment', label: 'Environment', filterOnly: false },
      { name: 'projectId', label: 'Project', filterOnly: false },
      { name: 'stepRunId', label: 'Step Run ID', filterOnly: false },
      { name: 'workflowEventType', label: 'Event Type', filterOnly: false },
      { name: 'workflowName', label: 'Workflow Name', filterOnly: false },
      { name: 'workflowRunId', label: 'Run ID', filterOnly: false },
      { name: 'workflowStatus', label: 'Status', filterOnly: false },
      { name: 'workflowStepName', label: 'Step Name', filterOnly: false },
    ],
    measures: [{ name: 'count', label: 'Count', unit: 'count' }],
  },
};

export function getEventNames(): string[] {
  return Object.keys(SCHEMA).sort();
}

export function getEvent(name: string): EventSchema | undefined {
  return SCHEMA[name];
}

export function getDimensions(eventName: string): DimensionSchema[] {
  return SCHEMA[eventName]?.dimensions ?? [];
}

export function getMeasures(eventName: string): MeasureSchema[] {
  return SCHEMA[eventName]?.measures ?? [];
}

export function getAggregations(
  eventName: string,
  measureName: string
): readonly string[] {
  const event = SCHEMA[eventName];
  if (!event) {
    return [];
  }
  const measure = event.measures.find(m => m.name === measureName);
  if (!measure) {
    return [];
  }
  if (measureName === 'count') {
    return COUNT_AGGREGATIONS;
  }
  return VALUE_AGGREGATIONS;
}
