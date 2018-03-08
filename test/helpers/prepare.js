// Native
const { join } = require('path')

// Packages
const { imageSync: getImageFile } = require('qr-image')
const { ensureDir, writeFile } = require('fs-extra')

const getDockerFile = session => `
  FROM mhart/alpine-node:latest

  LABEL name "now-cli-dockerfile-${session}"

  RUN mkdir /app
  WORKDIR /app
  COPY package.json /app
  RUN yarn
  COPY index.js /app

  EXPOSE 3000
  CMD ["yarn", "start"]
`

const getPackageFile = session => `
  {
    "name": "node-test-${session}",
    "main": "index.js",
    "license": "MIT",
    "scripts": {
      "start": "micro"
    },
    "dependencies": {
      "micro": "latest"
    }
  }
`

const getIndexFile = session => `
  module.exports = () => ({
    id: '${session}'
  })
`

module.exports = async session => {
  const files = {
    'Dockerfile': getDockerFile(session),
    'index.js': getIndexFile(session),
    'package.json': getPackageFile(session),
    'first.png': getImageFile(session, {
      size: 30
    }),
    'second.png': getImageFile(session, {
      size: 20
    })
  }

  const spec = {
    'dockerfile': [
      'index.js',
      'Dockerfile',
      'package.json'
    ],
    'node': [
      'index.js',
      'package.json'
    ],
    'static-single-file': [
      'first.png'
    ],
    'static-multiple-files': [
      'first.png',
      'second.png'
    ]
  }

  for (const type of Object.keys(spec)) {
    const needed = spec[type]

    for (const name of needed) {
      const directory = join(__dirname, '..', 'fixtures', 'integration', type)
      const file = join(directory, name)
      const content = files[name]

      await ensureDir(directory)
      await writeFile(file, content)
    }
  }
}
