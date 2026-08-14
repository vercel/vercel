import {
  createDiagnostics,
  generateRubyProjectManifest,
} from '@vercel/build-utils';

export { generateRubyProjectManifest as generateProjectManifest };

export const diagnostics = createDiagnostics('ruby');
