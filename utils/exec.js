const { execFileSync } = require('node:child_process');

function exec(cmd, args, opts) {
  console.log({ input: `${cmd} ${args.join(' ')}` });
  const output = execFileSync(cmd, args, {
    encoding: 'utf-8',
    ...opts,
  }).trim();
  console.log({ output });
  console.log();
  return output;
}

module.exports = {
  exec,
};
