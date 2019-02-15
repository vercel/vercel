const { join } = require('path');
const { downloadGo } = require('../go-helpers');

async function main() {
  // First download the `go` binary for this platform/arch.
  const go = await downloadGo();

  // Build the `get-exported-function-name` helper program.
  // `go get` is not necessary because the program has no external deps.
  const src = join(__dirname, 'get-exported-function-name.go');
  const dest = join(__dirname, '../get-exported-function-name');
  await go.build({ src, dest });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
