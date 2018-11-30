//      
import arg from 'arg';

import getCommonArgs from './arg-common';





function getArgs(
  argv          ,
  argsOptions          = {},
  argOptions              = {}
) {
  return arg(
    {
      ...getCommonArgs(),
      ...argsOptions
    },
    { ...argOptions, argv }
  );
}

export default getArgs;
