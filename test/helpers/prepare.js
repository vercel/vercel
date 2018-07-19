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
    ],
    'now-static-builds': {
      'now.json': '{"type": "static"}',
      'Dockerfile': `
FROM alpine
RUN mkdir /public
RUN echo hello > /public/index.html
      `
    },
    'build-env': {
      'now.json': JSON.stringify({
        type: 'static',
        build: {
          env: {FOO: 'bar'}
        }
      }),
      'Dockerfile': `
FROM alpine
ARG FOO
RUN mkdir /public
RUN echo $FOO > /public/index.html
      `
    },
    'build-env-arg': {
      'now.json': JSON.stringify({
        type: 'static'
      }),
      'Dockerfile': `
FROM alpine
ARG NONCE
RUN mkdir /public
RUN echo $NONCE > /public/index.html
      `
    }
  }

  for (const type of Object.keys(spec)) {
    const needed = spec[type]
    const directory = join(__dirname, '..', 'fixtures', 'integration', type)
    await ensureDir(directory)

    if(Array.isArray(needed)) {
      // Get content from the defined files
      for (const name of needed) {
        const file = join(directory, name)
        const content = files[name]
        await writeFile(file, content)
      }
    } else {
      // Get content from the object property
      const names = Object.keys(needed)
      for (const name of names) {
        const file = join(directory, name)
        const content = needed[name]
        await writeFile(file, content)
      }
    }
  }
}
