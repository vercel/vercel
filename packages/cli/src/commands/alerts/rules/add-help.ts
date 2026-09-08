import indent from '../../../util/output/indent';

const builtInBody = {
  type: 'built-in',
  name: 'Production server errors',
  triggers: {
    mode: 'selected',
    items: [
      {
        type: 'error_anomaly',
        filter: 'statusGroup:5xx AND route:/api/*',
      },
    ],
  },
  matchMinimumSeverityLevel: 'high',
};

const customBody = {
  type: 'custom',
  name: 'Checkout server errors',
  severity: 'high',
  evaluation: {
    window: '5m',
    query: {
      metrics: {
        errors: {
          metric: 'vercel.request.count',
          aggregation: 'count',
          filter: 'httpStatus >= 500',
        },
      },
      outputs: ['errors'],
    },
  },
  trigger: {
    type: 'threshold',
    output: 'errors',
    operator: 'gt',
    threshold: 20,
  },
};

export function getRulesAddBodyExamplesHelp(): string {
  return [
    'Scope',
    '',
    '  Provide ruleScope in the body or use a scope flag, not both.',
    '  --project maps to one included project for built-in rules and the required project for custom rules.',
    '  --all applies only to built-in rules and maps to every project in the team.',
    '',
    'Built-in body (rule.json)',
    '',
    indent(JSON.stringify(builtInBody, null, 2), 2),
    '',
    '  vercel alerts rules add --project my-app --body ./rule.json',
    '',
    'Custom body (rule.json)',
    '',
    indent(JSON.stringify(customBody, null, 2), 2),
    '',
    '  vercel alerts rules add --project my-app --body ./rule.json',
    '',
    'Authoring reference',
    '',
    '  vercel alerts rules schema --type <built-in|custom>',
    '  vercel metrics schema <metric-or-prefix>',
    '',
  ].join('\n');
}

export function getRulesUpdateBodyExamplesHelp(): string {
  const patchBody = {
    name: 'Critical production errors',
    matchMinimumSeverityLevel: 'critical',
  };

  return [
    'Update body',
    '',
    '  Include only the fields to change. type is optional and inferred from the stored rule.',
    '  Use --project or --all to change scope with or without --body.',
    '  Do not combine a ruleScope field in the body with --project or --all.',
    '  --all applies only to built-in rules.',
    '',
    'Partial body (patch.json)',
    '',
    indent(JSON.stringify(patchBody, null, 2), 2),
    '',
    '  vercel alerts rules update ar_abc123 --body ./patch.json',
    '  vercel alerts rules update ar_abc123 --project my-app',
    '',
    'Authoring reference',
    '',
    '  vercel alerts rules schema --type <built-in|custom>',
    '  vercel metrics schema <metric-or-prefix>',
    '',
  ].join('\n');
}
