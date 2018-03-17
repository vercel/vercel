// common options supported by all subcommands

module.exports = () => (
  {
    '--help': Boolean,
    '-h': '--help',

    '--debug': Boolean,
    '-d': '--debug',

    '--token': String,
    '-t': '--token',

    '--team': String,
    '-T': '--team',

    '--local-config': String,
    '-A': '--local-config',

    '--global-config': String,
    '-Q': '--global-config',

    '--api': String
  }
)
