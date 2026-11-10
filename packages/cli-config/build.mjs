import { esbuild } from '../../utils/build.mjs';

// Bundle the validation library to avoid resolving its many CommonJS modules
// on every CLI invocation. The standalone paths entry remains Zod-free.
await esbuild({ bundle: true, minifySyntax: true, minifyWhitespace: true });
