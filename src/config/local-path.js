// Native
const path = require('path')

// Packages
const mri = require('mri')

const getLocalPathConfig = prefix => {
  const args = mri(process.argv.slice(2), {
    string: ['local-config'],
    alias: {
      'local-config': 'A'
    }
  })

  const customPath = args['local-config']

  if (!customPath) {
    return path.join(prefix, 'now.json')
  }

  console.log(path.resolve(path, customPath))
  process.exit(1)

  return path.resolve(path, customPath)
}

module.exports = getLocalPathConfig
