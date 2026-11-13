import type { ToolPart } from '../types';
import { toolName } from '../stream';

type Output = Record<string, any>;

function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}

/** Non-empty lines of a text blob. */
function lines(text: unknown): string[] {
  return typeof text === 'string' ? text.split('\n').filter(l => l.trim()) : [];
}

/** Up to `max` lines, plus a `… +N lines` marker for the rest. */
function preview(all: string[], max: number): string[] {
  if (all.length <= max) return all;
  return [...all.slice(0, max), `… +${all.length - max} lines`];
}

type Summarizer = (output: Output, expanded: boolean) => string[] | undefined;

/** With `expanded`, a summary line is followed by the clipped detail. */
function withDetail(
  summary: string,
  detail: string[],
  expanded: boolean
): string[] {
  return expanded ? [summary, ...preview(detail, 20)] : [summary];
}

const SUMMARIZERS: Record<string, Summarizer> = {
  Bash(output, expanded) {
    const out = lines(output.output);
    const max = expanded ? 20 : 2;
    if (typeof output.exitCode === 'number' && output.exitCode !== 0) {
      return [
        `Exit code ${output.exitCode}`,
        ...preview([...lines(output.stderr), ...out], max),
      ];
    }
    return out.length ? preview(out, max) : ['(no output)'];
  },
  Read(output, expanded) {
    if (output.metadata?.linesShown !== undefined)
      return withDetail(
        `Read ${plural(output.metadata.linesShown, 'line')}`,
        lines(output.content),
        expanded
      );
  },
  Grep(output, expanded) {
    if (!output.summary) return undefined;
    const { matchCount = 0, fileCount = 0 } = output.summary;
    return withDetail(
      `${plural(matchCount, 'match', 'matches')} in ${plural(fileCount, 'file')}`,
      lines(output.matches),
      expanded
    );
  },
};

const searchResults: Summarizer = (output, expanded) => {
  if (!Array.isArray(output.results)) return undefined;
  const titles = output.results
    .map((r: Output) => r.title || r.url)
    .filter(Boolean);
  return withDetail(plural(output.results.length, 'result'), titles, expanded);
};

/**
 * The `⎿` lines under a tool call, like Claude Code: a short summary when collapsed,
 * plus more output (clipped) when expanded.
 */
export function toolResultLines(part: ToolPart, expanded: boolean): string[] {
  if (part.state === 'output-error')
    return preview(lines(part.errorText), expanded ? 20 : 1);
  if (part.state === 'output-denied') return ['Denied'];
  if (part.state !== 'output-available') return [];

  const output = (part.output ?? {}) as Output;
  const result =
    SUMMARIZERS[toolName(part)]?.(output, expanded) ??
    searchResults(output, expanded);
  if (result) return result;
  return expanded
    ? preview(JSON.stringify(output, null, 2).split('\n'), 20)
    : [];
}
