interface CommandError extends Error {
  command?: unknown;
  exitCode?: unknown;
  signal?: unknown;
  stdout?: unknown;
  stderr?: unknown;
  shortMessage?: unknown;
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export function formatCommandError(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }

  const error = err as CommandError;
  const parts: string[] = [
    getNonEmptyString(error.shortMessage) || err.message,
  ];

  for (const [label, value] of [
    ['Command', getNonEmptyString(error.command)],
    ['Exit code', getNumber(error.exitCode)],
    ['Signal', getNonEmptyString(error.signal)],
  ] as const) {
    if (value !== undefined) {
      parts.push(`${label}: ${value}`);
    }
  }

  for (const [label, output] of [
    ['stdout', getNonEmptyString(error.stdout)],
    ['stderr', getNonEmptyString(error.stderr)],
  ] as const) {
    if (output !== undefined) {
      parts.push(`${label}:\n${output}`);
    }
  }

  return parts.join('\n\n');
}
