// Native
const { join } = require('path');

// Packages
const { imageSync: getImageFile } = require('qr-image');
const { promises: { writeFile } } = require('fs');
const ensureDir = require('mkdirp-promise');

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
`;

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
`;

const getIndexFile = session => `
  module.exports = () => ({
    id: '${session}'
  })
`;

const getConfigFile = builds => builds ? `{
  "version": 2,
  "builds": [
    { "src": "*.html", "use": "@now/static" }
  ]
}` : `{
  "version": 1
}`;

const getIndexHTMLFile = session => `
<form action="/contact.php" method="POST">
  Post message for ${session} right here:
  <textarea name="Message" />
  <button>Submit</button>
</form>
`;

const getContactFile = session => `
<?php
if (empty($_ENV["AIRTABLE_KEY"])) {
  die("This is a test for ${session}");
}

http_request(
  "POST",
  "https://api.airtable.com/v0/appPkEQBBcdg0NIni/Messages",
  json_encode(array("fields" => $_POST)),
  array("headers" => array(
    "Authorization" => "Bearer " . $_ENV["AIRTABLE_KEY"],
    "Content-Type" => "application/json"
  ))
);
?>

<marquee>Thanks for your feedback!</marquee>
`;

module.exports = async session => {
  const files = {
    'Dockerfile': getDockerFile(session),
    'index.js': getIndexFile(session),
    'package.json': getPackageFile(session),
    'now.json': getConfigFile(false),
    'first.png': getImageFile(session, {
      size: 30
    }),
    'second.png': getImageFile(session, {
      size: 20
    }),
    'now.json-builds': getConfigFile(true),
    'index.html': getIndexHTMLFile(session),
    'contact.php': getContactFile(session)
 };

  const spec = {
    'dockerfile': [
      'index.js',
      'Dockerfile',
      'package.json',
      'now.json'
    ],
    'node': [
      'index.js',
      'package.json',
      'now.json'
    ],
    'builds': [
      'index.html',
      'now.json-builds'
    ],
    'static-single-file': [
      'first.png',
      'now.json'
    ],
    'static-multiple-files': [
      'first.png',
      'second.png',
      'now.json'
    ],
    'config-alias-property': {
      'now.json': '{ "alias": "test.now.sh", "builds": [ { "src": "*.html", "use": "@now/static" } ] }',
      'index.html': '<span>test alias</span'
    },
    'builds-wrong': {
      'now.json': '{"builder": 1, "type": "static"}',
      'index.html': '<span>test</span'
    },
    'now-static-build': {
      'now.json': '{"version": 1, "type": "static"}',
      'Dockerfile': `
FROM alpine
RUN mkdir /public
RUN echo hello > /public/index.html
      `
    },
    'build-env': {
      'now.json': JSON.stringify({
        version: 1,
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
        version: 1,
        type: 'static'
      }),
      'Dockerfile': `
FROM alpine
ARG NONCE
RUN mkdir /public
RUN echo $NONCE > /public/index.html
      `
    }
  };

  for (const type of Object.keys(spec)) {
    const needed = spec[type];
    const directory = join(__dirname, '..', 'fixtures', 'integration', type);
    await ensureDir(directory);

    if(Array.isArray(needed)) {
      // Get content from the defined files
      for (const name of needed) {
        const file = join(directory, name);
        const content = files[name];
        await writeFile(file.replace('-builds', ''), content);
      }
    } else {
      // Get content from the object property
      const names = Object.keys(needed);
      for (const name of names) {
        const file = join(directory, name);
        const content = needed[name];
        await writeFile(file.replace('-builds', ''), content);
      }
    }
  }
};
