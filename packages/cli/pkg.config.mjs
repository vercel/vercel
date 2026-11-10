export default {
  name: 'vercel',
  pkg: {
    scripts: [
      'pkg.js',
      'native-esbuild.js',
      'native-eject.js',
      'dist/vc.js',
      'dist/index.js',
      'dist/help.js',
      'dist/commands-*.js',
    ],
    assets: [
      'dist/**/*.js',
      'dist/**/*.cjs',
      'dist/**/*.mjs',
      'dist/**/*.json',
      'dist/**/*.br',
      // Sources the CLI uploads as they are, like vc dev --tunnel's function.
      'dist/runtime-assets/**/*.ts',
      'node_modules/**/*.js',
      'node_modules/**/*.cjs',
      'node_modules/**/*.mjs',
      'node_modules/**/*.json',
      'node_modules/**/*.wasm',
      'node_modules/**/*.node',
      'node_modules/**/@esbuild/*/bin/esbuild',
      'node_modules/**/@esbuild/*/esbuild.exe',
      // `fun` spawns these launchers in `vc dev` for Builders without a
      // `startDevServer`.
      'node_modules/@vercel/fun/dist/src/runtimes/**',
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
      'node24.22.1-linux-x64',
      'node24.22.1-linux-arm64',
      'node24.22.1-macos-x64',
      'node24.22.1-macos-arm64',
      'node24.22.1-win-x64',
      'node24.22.1-win-arm64',
    ],
    outputPath: process.env.VERCEL_CLI_BINARY_OUTPUT_DIR ?? 'dist-bin',
    sea: true,
    // Cache the SEA bootstrap's compilation without snapshotting runtime state.
    seaConfig: { useCodeCache: true },
    bytecode: false,
    // Avoid decompressing JavaScript on every invocation. This trades a larger
    // binary for lower startup latency across commands.
    compress: 'None',
    public: true,
    publicPackages: '*',
  },
};
