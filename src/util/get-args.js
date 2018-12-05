import arg from 'arg';
import getCommonArgs from './arg-common';

function getArgs(
  argv,
  argsOptions = {},
  argOptions = {}
) {
  let list = null;

  try {
    list = arg(
      {
        ...getCommonArgs(),
        ...argsOptions
      },
      { ...argOptions, argv }
    );
  } catch (err) {
    // If an error occures here, it's because the user
    // passed wrong arguments to Now CLI. In turn, we should
    // not report to Sentry.
    err.userError = true;
    throw err;
  }

  return list;
}

export default getArgs;
