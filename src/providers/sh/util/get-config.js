// returns the config based on the ctx
// received by subcommands for now.sh

const getConfig = (ctx) => {
  const { config: { sh } } = ctx
  return sh;
}

module.exports = getConfig;
