import type arg from 'arg';
import getCommonArgs from './arg-common';
import { getShortFlagLongName } from './get-flags-specification';
import { quoteArg } from './flags/quote-arg';
import { stripSensitiveAuthArgs } from './redact-args';
import { packageName } from './pkg-name';

/** A single insertion/deletion/substitution or adjacent transposition; ties are not guesses. */
export function suggestCorrection(
  input: string,
  choices: string[]
): string | undefined {
  if (input.replace(/^-+/, '').length < 3 || choices.includes(input)) return;
  const matches = [...new Set(choices)].filter(choice => {
    if (Math.abs(input.length - choice.length) > 1) return false;
    let i = 0;
    while (i < input.length && input[i] === choice[i]) i++;
    if (input.length === choice.length) {
      return (
        input.slice(i + 1) === choice.slice(i + 1) ||
        (input[i] === choice[i + 1] &&
          input[i + 1] === choice[i] &&
          input.slice(i + 2) === choice.slice(i + 2))
      );
    }
    return input.length > choice.length
      ? input.slice(i + 1) === choice.slice(i)
      : input.slice(i) === choice.slice(i + 1);
  });
  return matches.length === 1 ? matches[0] : undefined;
}

const SAFE_VALUE_FLAGS = new Set([
  '--cwd',
  '--scope',
  '--team',
  '-S',
  '-T',
  '--project',
  '-p',
  '--format',
  '--environment',
  '--since',
  '--until',
  '--limit',
]);
const READ_COMMANDS = new Set(['inspect', 'list', 'ls', 'schema', 'whoami']);

/** Unknown values are placeholders. Only known context and read-only resource arguments are copied. */
export function buildCorrectedCommand(
  argv: string[],
  from: string,
  to: string,
  flagsSpecification: arg.Spec = {}
): string {
  const corrected = argv.slice(2);
  const spec = { ...getCommonArgs(), ...flagsSpecification };
  // `-n` keeps its value wherever `--limit` does.
  const isSafeValueFlag = (name: string) =>
    SAFE_VALUE_FLAGS.has(getShortFlagLongName(name, spec) ?? name);
  const valuelessFlags = new Set<string>();
  const takesValue = new Set<string>();
  for (const [name, value] of Object.entries(spec)) {
    const handler = typeof value === 'string' ? spec[value] : value;
    (handler === Boolean ? valuelessFlags : takesValue).add(name);
  }
  for (let i = 0; i < corrected.length; i++) {
    const value = corrected[i];
    if (value === '--') break;
    if (value === from || value.startsWith(`${from}=`)) {
      corrected[i] = to + value.slice(from.length);
      break;
    }
    if (takesValue.has(value)) i++;
  }
  const args = stripSensitiveAuthArgs(corrected).filter(
    arg => !/^-t[^-=]/.test(arg)
  );
  const out: string[] = [];
  let positionals = 0;
  let readCommand = false;
  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (value === '--') {
      out.push('--', '<argument>');
      break;
    }
    if (value.startsWith('-')) {
      if (/^-[A-Za-z][^=].+/.test(value) && !value.startsWith('--')) {
        const name = value.slice(0, 2);
        out.push(name, isSafeValueFlag(name) ? value.slice(2) : '<value>');
        continue;
      }
      const equals = value.indexOf('=');
      const name = equals < 0 ? value : value.slice(0, equals);
      if (equals >= 0) {
        out.push(
          `${name}=${isSafeValueFlag(name) || (valuelessFlags.has(name) && /^(true|false)$/.test(value.slice(equals + 1))) ? value.slice(equals + 1) : '<value>'}`
        );
      } else {
        out.push(name);
        if (
          !valuelessFlags.has(name) &&
          i + 1 < args.length &&
          (takesValue.has(name) || !args[i + 1].startsWith('-'))
        ) {
          i++;
          out.push(isSafeValueFlag(name) ? args[i] : '<value>');
        }
      }
    } else {
      positionals++;
      if (positionals <= 2) readCommand ||= READ_COMMANDS.has(value);
      out.push(positionals <= 2 || readCommand ? value : '<argument>');
    }
  }
  return [packageName, ...out].map(quoteArg).join(' ');
}
