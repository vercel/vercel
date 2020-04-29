/**
 * This function adds a prefix `-` or `--` to the flags
 * passed from the command line, because the package `mri`
 * used to extract the args removes them for some reason.
 */
export default function getPrefixedFlags(args: { [key in string]: any }) {
  const prefixedArgs: {
    [key in string]: any;
  } = {};

  for (const arg in args) {
    if (arg === '_') {
      prefixedArgs[arg] = args[arg];
    } else {
      let prefix = '-';
      // Full form flags need two dashes, whereas one letter
      // flags need only one.
      if (arg.length > 1) {
        prefix = '--';
      }
      prefixedArgs[`${prefix}${arg}`] = args[arg];
    }
  }

  return prefixedArgs;
}
