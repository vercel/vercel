// @flow
import arg from 'arg'
const getCommonArgs = require('./arg-common')

type ArgOptions = {
  permissive?: boolean
}

function getArgs(argv: string[], argsOptions?: Object = {}, argOptions?: ArgOptions = {}) {
  return arg({
    ...getCommonArgs(),
    ...argsOptions
  }, { ...argOptions, argv })
}

export default getArgs
