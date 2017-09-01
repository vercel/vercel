const mainCommands = new Set([
  'deploy',
  'help',
  'list',
  'remove',
  'alias',
  'domains',
  'dns',
  'certs',
  'secrets',
  'billing',
  'upgrade',
  'teams',
  'logs',
  'scale',
  'login',
  'logout',
  'whoami'
])

const aliases = {
  list: ['ls'],
  remove: ['rm'],
  alias: ['ln', 'aliases'],
  domains: ['domain'],
  certs: ['cert'],
  secrets: ['secret'],
  billing: ['cc'],
  upgrade: ['downgrade'],
  teams: ['team', 'switch'],
  logs: ['log']
}

const subcommands = new Set(mainCommands)

// Add aliases to available sub commands
for (const alias in aliases) {
  const items = aliases[alias]

  for (const item of items) {
    subcommands.add(item)
  }
}

const details = {
  title: 'now.sh',
  subcommands
}

for (const subcommand of mainCommands) {
  let handlers = [subcommand]

  if (aliases[subcommand]) {
    handlers = handlers.concat(aliases[subcommand])
  }

  for (const handler of handlers) {
    Object.defineProperty(details, handler, {
      get() {
        return require(`./commands/bin/${subcommand}`)
      }
    })
  }
}

module.exports = details
