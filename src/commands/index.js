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
  'whoami',
  'inspect'
]);

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
  logs: ['log'],
  // This is only needed as long as the v1 platform
  // is still supported.
  deploy: ['deploy-v1', 'deploy-v2']
};

const subcommands = new Set(mainCommands);

// Add aliases to available sub commands
for (const alias in aliases) {
  const items = aliases[alias];

  for (const item of items) {
    subcommands.add(item);
  }
}

const details = {
  title: 'now.sh',
  subcommands
};

for (const subcommand of mainCommands) {
  let handlers = [subcommand];

  if (aliases[subcommand]) {
    handlers = handlers.concat(aliases[subcommand]);
  }

  for (const handler of handlers) {
    Object.defineProperty(details, handler, {
      get() {
        return require(`./${subcommand}`);
      }
    });
  }
}

module.exports = details;
