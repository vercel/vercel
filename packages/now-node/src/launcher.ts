import { Bridge } from './bridge';

let shouldStoreProxyRequests: boolean = false;
// PLACEHOLDER:shouldStoreProxyRequests

const bridge = new Bridge(undefined, shouldStoreProxyRequests);

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV =
    process.env.NOW_REGION === 'dev1' ? 'development' : 'production';
}

try {
  // PLACEHOLDER:setServer
} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND') {
    console.error(err.message);
    console.error(
      'Did you forget to add it to "dependencies" in `package.json`?'
    );
    process.exit(1);
  } else {
    console.error(err);
    process.exit(1);
  }
}

bridge.listen();

exports.launcher = bridge.launcher;
