import { packageName } from '../../util/pkg-name';

export const feedbackCommand = {
  name: 'feedback',
  aliases: [],
  description:
    'Send bugs, friction, and feature requests to the Vercel team. Describe what happened and what would have helped. You can submit a note, named fields, or both. Do not include secrets or PII in feedback.',
  arguments: [{ name: 'note', required: false }],
  options: [
    {
      name: 'field',
      shorthand: null,
      deprecatedShorthand: 'f',
      type: [String],
      argument: 'key=value',
      deprecated: false,
      description:
        'Named field (repeatable). Values are strings; the last value for a key wins.',
    },
  ],
  examples: [
    {
      name: 'Describe friction',
      value: `${packageName} feedback "The error didn't explain how to fix the issue"`,
    },
    {
      name: 'Read a note from stdin',
      value: `cat notes.md | ${packageName} feedback - --field topic=deploy`,
    },
    {
      name: 'Describe an issue with agent context',
      value: [
        `${packageName} feedback "The error did not explain the correct command"`,
        '--field type=bug --field product=cli --field model=gpt-6-astra',
        '--field task="deploy a preview"',
        '--field expected="Create a Preview deployment"',
        '--field actual="Unknown option: --preview"',
        '--field impact="Time spent finding the correct syntax"',
      ].join(' '),
    },
  ],
  helpSections: [
    {
      title: 'Fields (all optional)',
      rows: [
        { syntax: 'type', description: 'bug | friction | feature' },
        {
          syntax: 'product',
          description:
            'Vercel product the issue is about, e.g. functions, domains, ai-gateway',
        },
        {
          syntax: 'model',
          description: 'Model running the harness, e.g. claude-opus-5-5',
        },
        { syntax: 'task', description: 'What you were trying to do' },
        { syntax: 'expected', description: 'What you expected to happen' },
        {
          syntax: 'actual',
          description: 'What happened, including the error text',
        },
        {
          syntax: 'impact',
          description: 'What it cost: time, retries, workaround used',
        },
      ],
      body: [],
    },
  ],
} as const;
