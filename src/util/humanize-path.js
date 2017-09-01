// @flow
const { homedir } = require('os')
const { resolve } = require('path')

const humanizePath = (path: string) => {
  const resolved: string = resolve(path)
  const _homedir = homedir()
  if (resolved.indexOf(_homedir) === 0) {
    return `~` + resolved.substr(_homedir.length)
  } else {
    return resolved
  }
}

module.exports = humanizePath
