# now client

[![Build Status](https://travis-ci.org/zeit/now-client.svg?branch=master)](https://travis-ci.org/zeit/now-client)
[![Join the community on GitHub Discussions](https://badgen.net/badge/join%20the%20discussion/on%20github/black?icon=github)](https://github.com/zeit/now/discussions)

The official Node.js client for deploying to [Now](https://vercel.com/now). It supports v1 and v2 deployments.

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
- `<options>` - An object containing `token`, an optional `teamId` and any `vercel.json`-valid [fields](https://vercel.com/docs/api#endpoints/deployments/create-a-new-deployment)

```js
async function deploy() {
  let deployment;

  for await (const event of createDeployment({
    token: process.env.TOKEN,
    path: '/Users/zeit-user/projects/front',
  })) {
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
  // File events
  'hashes-calculated',
  'file-count',
  'file-uploaded',
  'all-files-uploaded',
  // Deployment events
  'created',
  'building',
  'ready',
  'alias-assigned',
  'warning',
  'error',
];
```

You can also get the events set programmatically:

```js
import { EVENTS } from 'now-client';
```
