# @vercel/client

[Join the Vercel Community](https://community.vercel.com/)

The official Node.js client for deploying to [Vercel](https://vercel.com).

## Usage

Firstly, install the package:

```bash
npm install @vercel/client
```

Next, load it:

```js
const { createDeployment } = require('@vercel/client');
```

Then call inside a `for...of` loop to follow the progress with the following arguments:

- `<path>` - a directory path / file path / array of file paths (must be on the same level)
- `<options>` - An object containing `token`, an optional `teamId` and any `vercel.json`-valid [fields](https://vercel.com/docs/api#endpoints/deployments/create-a-new-deployment)

```js
async function deploy() {
  let deployment;

  for await (const event of createDeployment({
    token: process.env.TOKEN,
    path: '/Users/me/Code/myproject',
  })) {
    if (event.type === 'ready') {
      deployment = event.payload;
      break;
    }
  }

  return deployment;
}
```

The optional second argument accepts deployment options, either as an object or
as a `Promise<DeploymentOptions>`. Use a promise to resolve metadata concurrently
with local file collection:

```js
const options = readDeploymentMetadata().then(gitMetadata => ({ gitMetadata }));

for await (const event of createDeployment(
  { token: process.env.TOKEN, path: '/path/to/project' },
  options
)) {
  // Handle deployment progress.
}
```

Start consuming the iterator immediately after creating the promise: the async
generator begins running on its first iteration. File collection and the
`hashes-calculated` event can finish before the options resolve, but uploads and
deployment creation wait for them. If the options reject, iteration throws before
uploading or creating the deployment. If local file collection fails first, that
error is reported and a later options rejection is handled internally.

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
import { EVENTS } from '@vercel/client';
```
