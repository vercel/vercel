// @flow
import arg from 'arg'
const getCommonArgs = require('./arg-common')

function getArgs(cliArgs: string[], options: Object) {
  return arg(cliArgs, {
    ...options,
    ...getCommonArgs()
  })
}

export default getArgs
