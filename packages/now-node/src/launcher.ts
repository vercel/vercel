export function makeLauncher(
  entrypoint: string,
  shouldAddHelpers: boolean
): string {
  return `const { Bridge } = require("./bridge");

let bridge;

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV =
    process.env.NOW_REGION === 'dev1' ? 'development' : 'production';
}

try {
  let listener = require("./${entrypoint}");
  if (listener.default) listener = listener.default;

  if(typeof listener.listen === 'function') {
    const server = listener;
    bridge = new Bridge(server);
  } else if(typeof listener === 'function') {
    ${
      shouldAddHelpers
        ? [
            'bridge = new Bridge(undefined, true);',
            'const server = require("./helpers").createServerWithHelpers(listener, bridge);',
            'bridge.setServer(server);',
          ].join('\n')
        : [
            'const server = require("http").createServer(listener);',
            'bridge = new Bridge(server);',
          ].join('\n')
    }
  } else {
    console.error('Export in entrypoint is not valid');
    console.error('Did you forget to export a function or a server?');
    process.exit(1);
  }

} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND') {
    console.error(err.message);
    console.error('Did you forget to add it to "dependencies" in \`package.json\`?');
    process.exit(1);
  } else {
    console.error(err);
    process.exit(1);
  }
}

bridge.listen();

exports.launcher = bridge.launcher;`;
}
