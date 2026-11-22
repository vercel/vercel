const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const toolchainFile = path.join(
  root,
  'packages/python-analysis/rust-toolchain.toml'
);
const workflowsDir = path.join(root, '.github/workflows');

// `@vercel/python-analysis#build:wasm` is cached by Turbo, and the pinned
// channel in rust-toolchain.toml is the only record of the rustc version in its
// hash. CI must install the same version, or every job rebuilds the wasm.
function readChannel() {
  const source = fs.readFileSync(toolchainFile, 'utf8');
  const match = source.match(/^\s*channel\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(`No channel found in ${toolchainFile}`);
  }
  return match[1];
}

function findWorkflowPins() {
  const pins = [];
  const patterns = [
    /^\s*toolchain:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/,
    /\brustup default ['"]?(\d+\.\d+\.\d+)\b/,
  ];
  for (const name of fs.readdirSync(workflowsDir).sort()) {
    if (!/\.ya?ml$/.test(name)) continue;
    const lines = fs
      .readFileSync(path.join(workflowsDir, name), 'utf8')
      .split('\n');
    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          pins.push({ location: `${name}:${index + 1}`, version: match[1] });
        }
      }
    });
  }
  return pins;
}

describe('python-analysis Rust toolchain pin', () => {
  test('rust-toolchain.toml pins an exact version', () => {
    expect(readChannel()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('every exact Rust version pinned in workflows matches rust-toolchain.toml', () => {
    const channel = readChannel();
    const pins = findWorkflowPins();
    expect(pins.length).toBeGreaterThan(0);
    const mismatches = pins.filter(pin => pin.version !== channel);
    expect(mismatches).toEqual([]);
  });
});
