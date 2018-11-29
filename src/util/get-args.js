//      
import arg from 'arg';

const getCommonArgs = require('./arg-common');

                   
                      
  

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
