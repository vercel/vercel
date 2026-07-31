export const CUSTOM_ALERT_EVENT_HELP = [
  'Run `vercel metrics schema <metric-or-prefix>` to discover available metrics, aggregations, and dimensions. Metric IDs use the `vercel.` namespace, for example `vercel.request.count`.',
  'Custom alert queries use query-engine event and measure names instead of the public metric ID.',
  '`vercel.request.count` maps to `event: "incomingRequest"` and `measure: "count"`; `vercel.function_invocation.count` maps to `event: "serverlessFunctionInvocation"` and `measure: "count"`.',
];
