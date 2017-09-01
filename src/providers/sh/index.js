const mainCommands = new Set([
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
  'logout',
  'whoami'
])

const specialCommands = new Set([
  'deploy',
  'login'
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

const subcommands = new Set([
  ...Array.from(mainCommands),
  ...Array.from(specialCommands)
])

// Add aliases to available sub commands
for (const alias in aliases) {
  const items = aliases[alias]

  for (const item of items) {
    subcommands.add(item)
  }
}

const list = {
  title: 'now.sh',
  subcommands,
  get deploy() {
    return require('./deploy')
  },
  get login() {
    return require('./login')
  }
}

for (const subcommand of mainCommands) {
  let handlers = [subcommand]

  if (aliases[subcommand]) {
    handlers = handlers.concat(aliases[subcommand])
  }

  for (const handler of handlers) {
    Object.defineProperty(list, handler, {
      get() {
        return require(`./commands/bin/${subcommand}`)
      }
    })
  }
}

module.exports = list
