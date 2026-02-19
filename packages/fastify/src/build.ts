// @ts-expect-error - FIXME: framework build is not exported
import { build as nodeBuild } from '@vercel/node';
import { generateNodeBuilderFunctions } from '@vercel/build-utils';

const {
  build: build2,
  entrypointCallback,
  findEntrypoint,
  require_,
} = generateNodeBuilderFunctions(
  'fastify',
  /(?:from|require|import)\s*(?:\(\s*)?["']fastify["']\s*(?:\))?/g,
  ['app', 'index', 'server', 'src/app', 'src/index', 'src/server'],
  ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'],
  nodeBuild
);

const shim = `
import { channel } from "node:diagnostics_channel";
const originalConsoleLog = console.log.bind(console);
let currentRoute = "";
console.log = (...args) => {
  originalConsoleLog(\`\${currentRoute} \${args.join(" ")}\`);
};

const tracingChannel = channel("tracing:fastify.request.handler:start");
tracingChannel.subscribe((msg) => {
  currentRoute = msg.route.url;
});
`;

const build = async (...args: Parameters<typeof build2>) => {
  const result = await build2(...args);
  // console.log('yooo', result);
  const entrypointFile = result.output?.files?.['server.js'];
  if (!entrypointFile) {
    throw new Error('Entrypoint file not found');
  }
  if (entrypointFile.type === 'FileBlob') {
    entrypointFile.data =
      entrypointFile.data = `${shim}\n${entrypointFile.data}`;
  }
  return result;
};

export { build, entrypointCallback, findEntrypoint, require_ };
