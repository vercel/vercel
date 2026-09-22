export default {
  name: 'vercel',
  pkg: {
    scripts: [
      'pkg.js',
      'dist/vc.js',
      'dist/index.js',
      'dist/help.js',
      'dist/commands-bulk.js',
    ],
    assets: [
      'dist/**/*.js',
      'dist/**/*.cjs',
      'dist/**/*.mjs',
      'dist/**/*.json',
      'dist/**/*.br',
      'node_modules/**/*.js',
      'node_modules/**/*.cjs',
      'node_modules/**/*.mjs',
      'node_modules/**/*.json',
      'node_modules/**/*.wasm',
      'node_modules/**/*.node',
    ],
    // Test files shipped inside dependencies are never loaded by the CLI.
    // Excluding them also stops pkg from following their requires into test
    // frameworks that happen to be resolvable from the staging directory.
    ignore: [
      '**/node_modules/**/*.test.{js,cjs,mjs}',
      '**/node_modules/**/*.spec.{js,cjs,mjs}',
      '**/node_modules/**/{test,tests,__tests__}/**',
    ],
    targets: [
      'node24.14.1-linux-x64',
      'node24.14.1-linux-arm64',
      'node24.14.1-macos-x64',
      'node24.14.1-macos-arm64',
      'node24.14.1-win-x64',
    ],
    outputPath: process.env.VERCEL_CLI_BINARY_OUTPUT_DIR ?? 'dist-bin',
    sea: true,
    bytecode: false,
    compress: 'Brotli',
    public: true,
    publicPackages: '*',
  },
};
