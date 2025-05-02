/**
 * Inlined version of the 'strip-ansi' package
 * Original: https://github.com/chalk/strip-ansi
 * License: MIT
 *
 * Also includes inlined version of 'ansi-regex' package
 * Original: https://github.com/chalk/ansi-regex
 * License: MIT
 */

/**
 * Inlined ansi-regex functionality
 */
function ansiRegex({ onlyFirst = false } = {}): RegExp {
  const ST = '(?:\\u0007|\\u001B\\u005C|\\u009C)';
  const pattern = [
    `[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?${ST})`,
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))',
  ].join('|');

  return new RegExp(pattern, onlyFirst ? undefined : 'g');
}

const regex = ansiRegex();

/**
 * Strip ANSI escape codes from a string
 */
export default function stripAnsi(string: string): string {
  if (typeof string !== 'string') {
    throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
  }

  return string.replace(regex, '');
}
