#!/usr/bin/env node

// Packages
import chalk from 'chalk';
import minimist from 'minimist';
import table from 'text-table';
import ms from 'ms';

// Ours
import login from '../lib/login';
import * as cfg from '../lib/cfg';
import { error } from '../lib/error';
import toHost from '../lib/to-host';
import strlen from '../lib/strlen';
import NowDomains from '../lib/domains';

const argv = minimist(process.argv.slice(2), {
  string: ['config', 'token'],
  boolean: ['help', 'debug'],
  alias: {
    help: 'h',
    config: 'c',
    debug: 'd',
    token: 't'
  }
});
const subcommand = argv._[0];

// options
const help = () => {
  console.log(`
  ${chalk.bold('𝚫 now domains')} <ls | add | rm> <domain>

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')} Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Lists all your domains:

      ${chalk.cyan('$ now domains ls')}

  ${chalk.gray('–')} Adds a domain name:

      ${chalk.cyan(`$ now domains add ${chalk.underline('my-app.com')}`)}

      Make sure the domain's DNS nameservers are at least 2 of these:

      ${chalk.gray('–')} ${chalk.underline('california.zeit.world')}    ${chalk.dim('173.255.215.107')}
      ${chalk.gray('–')} ${chalk.underline('london.zeit.world')}        ${chalk.dim('178.62.47.76')}
      ${chalk.gray('–')} ${chalk.underline('newark.zeit.world')}        ${chalk.dim('173.255.231.87')}
      ${chalk.gray('–')} ${chalk.underline('amsterdam.zeit.world')}     ${chalk.dim('188.226.197.55')}
      ${chalk.gray('–')} ${chalk.underline('dallas.zeit.world')}        ${chalk.dim('173.192.101.194')}
      ${chalk.gray('–')} ${chalk.underline('paris.zeit.world')}         ${chalk.dim('37.123.115.172')}
      ${chalk.gray('–')} ${chalk.underline('singapore.zeit.world')}     ${chalk.dim('119.81.97.170')}
      ${chalk.gray('–')} ${chalk.underline('sydney.zeit.world')}        ${chalk.dim('52.64.171.200')}
      ${chalk.gray('–')} ${chalk.underline('frankfurt.zeit.world')}     ${chalk.dim('91.109.245.139')}
      ${chalk.gray('–')} ${chalk.underline('iowa.zeit.world')}          ${chalk.dim('23.236.59.22')}

      ${chalk.yellow('NOTE:')} running ${chalk.dim('`now alias`')} will automatically register your domain
      if it's configured with these nameservers (no need to ${chalk.dim('`domain add`')}).

      For more details head to ${chalk.underline('https://zeit.world')}.

  ${chalk.gray('–')} Removing a domain:

      ${chalk.cyan('$ now domain rm my-app.com')}

      or

      ${chalk.cyan('$ now domain rm domainId')}

      To get the list of domain ids, use ${chalk.dim('`now domains ls`')}.
`);
};

// options
const debug = argv.debug;
const apiUrl = argv.url || 'https://api.zeit.co';
if (argv.config) cfg.setConfigFile(argv.config);

const exit = (code) => {
  // we give stdout some time to flush out
  // because there's a node bug where
  // stdout writes are asynchronous
  // https://github.com/nodejs/node/issues/6456
  setTimeout(() => process.exit(code || 0), 100);
};

if (argv.help || !subcommand) {
  help();
  exit(0);
} else {
  const config = cfg.read();

  Promise.resolve(argv.token || config.token || login(apiUrl))
  .then(async (token) => {
    try {
      await run(token);
    } catch (err) {
      if (err.userError) {
        error(err.message);
      } else {
        error(`Unknown error: ${err.stack}`);
      }
      exit(1);
    }
  })
  .catch((e) => {
    error(`Authentication error – ${e.message}`);
    exit(1);
  });
}

async function run (token) {
  const domain = new NowDomains(apiUrl, token, { debug });
  const args = argv._.slice(1);

  switch (subcommand) {
    case 'ls':
    case 'list':
      if (0 !== args.length) {
        error('Invalid number of arguments');
        return exit(1);
      }

      const start_ = new Date();
      const domains = await domain.ls();
      domains.sort((a, b) => new Date(b.created) - new Date(a.created));
      const current = new Date();
      const header = [['', 'id', 'dns', 'url', 'created'].map(s => chalk.dim(s))];
      const out = domains.length === 0 ? null : table(header.concat(domains.map((domain) => {
        const ns = domain.isExternal ? 'external' : 'zeit.world';
        const url = chalk.underline(`https://${domain.name}`);
        const time = chalk.gray(ms(current - new Date(domain.created)) + ' ago');
        return [
          '',
          domain.uid,
          ns,
          url,
          time
        ];
      })), { align: ['l', 'r', 'l', 'l', 'l'], hsep: ' '.repeat(2), stringLength: strlen });

      const elapsed_ = ms(new Date() - start_);
      console.log(`> ${domains.length} domain${domains.length !== 1 ? 's' : ''} found ${chalk.gray(`[${elapsed_}]`)}`);
      if (out) console.log('\n' + out + '\n');
      break;

    case 'rm':
    case 'remove':
      if (1 !== args.length) {
        error('Invalid number of arguments');
        return exit(1);
      }

      const _target = String(args[0]);
      if (!_target) {
        const err = new Error('No domain specified');
        err.userError = true;
        throw err;
      }

      const _domains = await domain.ls();
      const _domain = findDomain(_target, _domains);

      if (!_domain) {
        const err = new Error(`Domain not found by "${_target}". Run ${chalk.dim('`now domains ls`')} to see your domains.`);
        err.userError = true;
        throw err;
      }

      try {
        const confirmation = (await readConfirmation(domain, _domain, _domains)).toLowerCase();
        if ('y' !== confirmation && 'yes' !== confirmation) {
          console.log('\n> Aborted');
          process.exit(0);
        }

        const start = new Date();
        await domain.rm(_domain.name);
        const elapsed = ms(new Date() - start);
        console.log(`${chalk.cyan('> Success!')} Domain ${chalk.bold(_domain.uid)} removed [${elapsed}]`);
      } catch (err) {
        error(err);
        exit(1);
      }
      break;

    case 'add':
    case 'set':
      if (1 !== args.length) {
        error('Invalid number of arguments');
        return exit(1);
      }

      const start = new Date();
      const name = String(args[0]);
      const { uid, created } = await domain.add(name);
      const elapsed = ms(new Date() - start);
      if (created) {
        console.log(`${chalk.cyan('> Success!')} Domain ${chalk.bold(chalk.underline(name))} ${chalk.dim(`(${uid})`)} added [${elapsed}]`);
      } else {
        console.log(`${chalk.cyan('> Success!')} Domain ${chalk.bold(chalk.underline(name))} ${chalk.dim(`(${uid})`)} already exists [${elapsed}]`);
      }
      break;

    default:
      error('Please specify a valid subcommand: ls | add | rm');
      help();
      exit(1);
  }

  domain.close();
}

function indent (text, n) {
  return text.split('\n').map((l) => ' '.repeat(n) + l).join('\n');
}

async function readConfirmation (domain, _domain, list) {
  const urls = new Map(list.map(l => [l.uid, l.url]));

  return new Promise((resolve, reject) => {
    const time = chalk.gray(ms(new Date() - new Date(_domain.created)) + ' ago');
    const tbl = table(
      [[_domain.uid, chalk.underline(`https://${_domain.name}`), time]],
      { align: ['l', 'r', 'l'], hsep: ' '.repeat(6) }
    );

    process.stdout.write('> The following domain will be removed permanently\n');
    process.stdout.write('  ' + tbl + '\n');
    if (_domain.aliases.length) {
      process.stdout.write(`> ${chalk.yellow('Warning!')} This domain's `
      + `${chalk.bold(_domain.aliases.length + ' alias' + (_domain.aliases.length !== 1 ? 'es': ''))} `
      + `will be removed. Run ${chalk.dim('`now alias ls`')} to list.\n`);
    }
    process.stdout.write(`  ${chalk.bold.red('> Are you sure?')} ${chalk.gray('[yN] ')}`);

    process.stdin.on('data', (d) => {
      process.stdin.pause();
      resolve(d.toString().trim());
    }).resume();
  });
}

function findDomain (val, list) {
  return list.find((d) => {
    if (d.uid === val) {
      if (debug) console.log(`> [debug] matched domain ${d.uid} by uid`);
      return true;
    }

    // match prefix
    if (d.name === toHost(val)) {
      if (debug) console.log(`> [debug] matched domain ${d.uid} by name ${d.name}`);
      return true;
    }

    return false;
  });
}
