export const CUSTOM_ALERT_EVENT_HELP = [
  'Use `vercel metrics schema` to discover custom alert metrics. Metric IDs use the `vercel.` namespace, for example `vercel.request.count`.',
  'Custom alert queries use query-engine event and measure names instead of the public metric ID.',
  '`vercel.request.count` maps to `event: "incomingRequest"` and `measure: "count"`; `vercel.function_invocation.count` maps to `event: "serverlessFunctionInvocation"` and `measure: "count"`.',
  'Run `vercel alerts rules schema --type custom_alert <metric-or-prefix>` with a `vercel.` metric or prefix to see the available measures, aggregations, and dimensions.',
];
