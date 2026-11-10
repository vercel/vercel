// Commands marked as beta in the version banner and in `vercel --help`.
export const BETA_COMMANDS: ReadonlySet<string> = new Set([
  'budget',
  'budgets',
  'crons',
  'daemons',
  'kms',
  'schedules',
]);
