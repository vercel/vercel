import stringWidth from 'string-width';
import chars from './chars';
import { remoteText } from './remote-text';
import { createHelpTheme, type HelpTheme } from './help-theme';

export interface HelpSpan {
  text: string;
  literal?: true;
}

export interface HelpRow {
  syntax: string | ReadonlyArray<HelpSpan>;
  description: string;
}

export function helpLiterals(values: ReadonlyArray<string>): HelpSpan[] {
  return values.flatMap((text, index) => [
    ...(index ? [{ text: ' | ' }] : []),
    { text, literal: true as const },
  ]);
}

export function helpSyntaxWidth(values: ReadonlyArray<string>): number {
  return Math.max(0, ...values.map(value => stringWidth(remoteText(value))));
}

export function helpPlaceholders(
  values: ReadonlyArray<string>,
  markers: ReadonlyArray<string> = []
): string[] {
  const commands = values.map(remoteText);
  return [...new Set(markers.map(remoteText))].filter(
    marker =>
      /^<[^<>\r\n]+>$/.test(marker) &&
      commands.some(command => command.includes(marker))
  );
}

export function helpColumns(columns = 80): number {
  return Number.isFinite(columns) && columns > 0
    ? Math.max(1, Math.floor(columns))
    : 80;
}

export function helpHeading(title: string, theme = createHelpTheme()): string {
  return theme.heading(`${remoteText(title)}:`);
}

/** Synopsis labels are not navigational section headings. */
export function helpUsage(theme = createHelpTheme()): string {
  return theme.emphasis(chars.triangle);
}

/** Inline references remain neutral and visibly delimited in every mode. */
export function helpInlineCommand(command: string): string {
  return `\`${remoteText(command)}\``;
}

/** Wrap prose without splitting a token, losing indentation, or truncating data. */
export function wrapHelpText(
  text: string,
  columns: number,
  indent = '  '
): string {
  return text
    .split('\n')
    .flatMap(paragraph => {
      const safe = remoteText(paragraph.replace(/\t/g, '  '));
      if (/^ *$/.test(safe)) return [''];
      const prefix = indent + (safe.match(/^ */)?.[0] ?? '');
      const lines: string[] = [];
      let line = prefix;
      for (const match of safe
        .replace(/^ +| +$/g, '')
        .matchAll(/( *)([^ ]+)/g)) {
        const [, whitespace, word] = match;
        const separator = line === prefix ? '' : whitespace;
        if (
          line !== prefix &&
          stringWidth(`${line}${separator}${word}`) > columns
        ) {
          lines.push(line);
          line = prefix + word;
        } else {
          line += separator + word;
        }
      }
      lines.push(line);
      return lines;
    })
    .join('\n');
}

/** Each section uses one layout; narrow descriptions stack below intact syntax. */
export function helpRows(
  rows: ReadonlyArray<HelpRow>,
  columns: number,
  theme = createHelpTheme(),
  minimumSyntaxWidth = 0
): string {
  if (!rows.length) return '';
  const safeRows = rows.map(row => {
    const spans =
      typeof row.syntax === 'string' ? [{ text: row.syntax }] : row.syntax;
    const safe = spans.map(span => ({ ...span, text: remoteText(span.text) }));
    return {
      syntax: safe.map(span => span.text).join(''),
      styled: safe
        .map(span => (span.literal ? theme.reference(span.text) : span.text))
        .join(''),
      description: row.description.trim(),
    };
  });
  const syntaxWidth = Math.max(
    minimumSyntaxWidth,
    ...safeRows.map(row => stringWidth(row.syntax))
  );
  const descriptionColumn = syntaxWidth + 4;
  const stacked = columns - descriptionColumn < 28;
  return safeRows
    .map(({ syntax, styled, description }) => {
      if (!description) return `  ${styled}`;
      if (stacked) {
        return `  ${styled}\n${wrapHelpText(description, columns, '    ')}`;
      }
      const prefix = ' '.repeat(descriptionColumn);
      const wrapped = wrapHelpText(description, columns, prefix);
      return `  ${styled}${' '.repeat(syntaxWidth - stringWidth(syntax) + 2)}${wrapped.slice(prefix.length)}`;
    })
    .join('\n');
}

export function helpSection(
  title: string,
  body: string,
  theme = createHelpTheme()
): string {
  return body.trim() ? `${helpHeading(title, theme)}\n${body}` : '';
}

/** Discovery teaches canonical names; accepted aliases remain parser metadata. */
export function helpCommandNames(command: { name: string }): string[] {
  return [command.name];
}

/** Accent concrete commands only; explicitly declared templates stay neutral. */
export function helpCommand(
  command: string,
  placeholders: ReadonlyArray<string> = [],
  theme: HelpTheme = createHelpTheme()
): string {
  const safe = remoteText(command);
  const isTemplate = helpPlaceholders([safe], placeholders).length > 0;
  return `    ${isTemplate ? safe : theme.command(safe)}`;
}
