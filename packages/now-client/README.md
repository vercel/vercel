# now client

[![Build Status](https://travis-ci.org/zeit/now-client.svg?branch=master)](https://travis-ci.org/zeit/now-client) [![Join the community on Spectrum](https://withspectrum.github.io/badge/badge.svg)](https://spectrum.chat/zeit)

The official Node.js client for deploying to [Now](https://zeit.co/now). It supports v1 and v2 deployments.

## Usage

Firstly, install the package:

```bash
npm install now-client
# or
yarn add now-client
```

Next, load it:

```js
// v2
const { createDeployment } = require('now-client');
// v1
const { createLegacyDeployment } = require('now-client');
```

Then call inside a `for...of` loop to follow the progress with the following arguments:

- `<path>` - a directory path / file path / array of file paths (must be on the same level)
- `<options>` - An object containing `token`, an optional `teamId` and any `now.json`-valid [fields](https://zeit.co/docs/api#endpoints/deployments/create-a-new-deployment)

```js
async function deploy() {
  let deployment;

  for await (const event of createDeployment(
    '/Users/zeit-user/projects/front',
    { token: process.env.TOKEN }
  )) {
    if (event.type === 'ready') {
      deployment = event.payload;
      break;
    }
  }

  return deployment;
}
```

Full list of events:

```js
[
  // File events (receive relevant data as payload)
  'hashes-calculated',
  'file-uploaded',
  'all-files-uploaded',
  // Deployment events (receive deployment object as payload)
  'created',
  'ready',
  'error',
  // Build events (receive build object as payload)
  'build-state-changed'
];
```

You can also get the events set programmatically:

```js
import { EVENTS } from 'now-client';
```
