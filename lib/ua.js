import os from 'os'
import {version} from '../../package' // eslint-disable-line import/no-unresolved

export default `now ${version} node-${process.version} ${os.platform()} (${os.arch()})`
