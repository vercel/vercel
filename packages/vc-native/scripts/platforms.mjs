// Single source of truth for the native per-platform packages.
// Consumed by stage-packages.mjs (staging/publishing the native npm packages)
// and utils/inject-native-optional-deps.mjs (wiring them onto `vercel` as
// optionalDependencies at pack time). Keep this list in sync with the build
// matrix in .github/workflows/release-binary.yml.
export const platforms = [
  {
    name: '@vercel/vc-native-darwin-arm64',
    asset: 'vercel-darwin-arm64',
    os: ['darwin'],
    cpu: ['arm64'],
  },
  {
    name: '@vercel/vc-native-darwin-x64',
    asset: 'vercel-darwin-x64',
    os: ['darwin'],
    cpu: ['x64'],
  },
  {
    name: '@vercel/vc-native-linux-arm64',
    asset: 'vercel-linux-arm64',
    os: ['linux'],
    cpu: ['arm64'],
  },
  {
    name: '@vercel/vc-native-linux-x64',
    asset: 'vercel-linux-x64',
    os: ['linux'],
    cpu: ['x64'],
  },
  {
    name: '@vercel/vc-native-win32-x64',
    asset: 'vercel-windows-x64.exe',
    os: ['win32'],
    cpu: ['x64'],
    binary: 'vercel.exe',
  },
];
