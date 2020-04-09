/* 
    This function returns the provided arguments from a command in a string format.

    Example: if `argv` is { '--debug': true, '--all': true, '--scope': 'zeit' },
    the output will be '--debug --all --scope zeit'.

    Flags can be excluded using the `excludeFlags` param.
*/
export default function getCommandFlags(
  argv: { [key: string]: any },
  excludeFlags: string[] = []
) {
  const flags = Object.keys(argv)
    .filter(key => !excludeFlags.includes(key))
    .map(
      key => `${key}${typeof argv[key] !== 'boolean' ? ' ' + argv[key] : ''}`
    );

  return flags.length > 0 ? ` ${flags.join(' ')}` : '';
}
