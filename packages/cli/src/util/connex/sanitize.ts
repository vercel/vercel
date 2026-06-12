import stripAnsi from 'strip-ansi';

/**
 * Strip ANSI/VT100 escape sequences from a team-controlled value before it
 * reaches the terminal.
 *
 * Connector names, UIDs, and project names are free-form and visible across
 * a team, so a malicious team member can embed escape sequences that, when
 * rendered by another member's terminal, allow cursor manipulation, output
 * spoofing, or hyperlink spoofing. Run every such value through this helper
 * at the point it is assigned for human-readable output.
 *
 * Do NOT use this for `--format=json` output: JSON consumers expect the raw
 * value, and `JSON.stringify` already escapes control characters.
 */
export function sanitizeForTerminal(value: string): string {
  return stripAnsi(value);
}
