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

const patchBody = {
  name: 'Critical production errors',
  matchMinimumSeverityLevel: 'critical',
};

const authoringReference = {
  title: 'Authoring reference',
  body: [{ command: 'vercel monitors schema --type built-in' }],
};

export const monitorsAddHelpSections = [
  {
    title: 'Scope',
    body: [
      'Provide ruleScope in the body or use a scope option, not both.',
      '--project maps to one included project.',
      '--all maps to every project in the team.',
    ],
  },
  {
    title: 'Built-in body (rule.json)',
    preformatted: true as const,
    body: [
      ...JSON.stringify(builtInBody, null, 2).split('\n'),
      '',
      { command: 'vercel monitors add --project my-app --body ./rule.json' },
    ],
  },
  authoringReference,
];

export const monitorsUpdateHelpSections = [
  {
    title: 'Update body',
    body: [
      'Include only the fields to change. type is optional and inferred from the stored monitor.',
      'Use --project or --all to change scope with or without --body.',
      'Do not combine a ruleScope field in the body with --project or --all.',
      '--all moves the monitor to team-wide scope.',
    ],
  },
  {
    title: 'Partial body (patch.json)',
    preformatted: true as const,
    body: [
      ...JSON.stringify(patchBody, null, 2).split('\n'),
      '',
      { command: 'vercel monitors update ar_abc123 --body ./patch.json' },
      { command: 'vercel monitors update ar_abc123 --project my-app' },
    ],
  },
  authoringReference,
];
