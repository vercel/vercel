#!/usr/bin/env node
// @flow

// Native
const path = require('path')

// Packages
const arg = require('arg')
const chalk = require('chalk')
const fs = require('fs-extra')
const ms = require('ms')
const plural = require('pluralize')
const psl = require('psl')
const table = require('text-table')

// Utilities
const { handleError } = require('../util/error')
const argCommon = require('../util/arg-common')()
const cmd = require('../../../util/output/cmd')
const createOutput = require('../../../util/output')
const elapsed = require('../../../util/output/elapsed')
const getContextName = require('../util/get-context-name')
const logo = require('../../../util/output/logo')
const Now = require('../util')
const strlen = require('../util/strlen')
const wait = require('../../../util/output/wait')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now certs`)} [options] <command>

  ${chalk.yellow('NOTE:')} This command is intended for advanced use only.
  By default, Now manages your certificates automatically.

  ${chalk.dim('Commands:')}

    ls                    Show all available certificates
    add    <cn>[, <cn>]   Create a certificate for a domain
    rm     <id>           Renew the certificate of a existing domain

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    --crt ${chalk.bold.underline('FILE')}                     Certificate file
    --key ${chalk.bold.underline('FILE')}                     Certificate key file
    --ca ${chalk.bold.underline('FILE')}                      CA certificate chain file
    -T, --team                     Set a custom team scope

  ${chalk.dim('Examples:')}

  ${chalk.gray(
    '–'
  )} Generate a certificate with the cnames "acme.com" and "www.acme.com"

      ${chalk.cyan(
        '$ now certs add acme.com www.acme.com'
      )}

  ${chalk.gray(
    '–'
  )} Remove a certificate

      ${chalk.cyan(
        '$ now certs rm acme.com www.acme.com'
      )}
  `)
}

module.exports = async function main(ctx: any): Promise<number> {
  let argv

  try {
    argv = arg(ctx.argv.slice(3), {
      '--overwrite': Boolean,
      '--crt': String,
      '--key': String,
      '--ca': String,
      ...argCommon
    })
  } catch (err) {
    handleError(err)
    return 1;
  }
  
  const apiUrl = ctx.apiUrl
  const debugEnabled = argv['--debug']
  const subcommand = argv._[0];
  const output = createOutput({ debug: debugEnabled });
  const { success, log, print, error } = output;

  if (!subcommand) {
    error(`${cmd('now cert <command>')} expects one command`)
    help()
    return 1;
  }

  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')
  const { currentTeam } = sh;
  const contextName = getContextName(sh);

  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam })
  const args = argv._.slice(1)
  const startTime = Date.now()

  if (subcommand === 'ls' || subcommand === 'list') {
    if (args.length !== 0) {
      error(`Invalid number of arguments. Usage: ${chalk.cyan('`now certs ls`')}`)
      return 1;
    }

    // Get the list of certificates
    const certs = sortByCn(await caught(getCerts(now)))
    log(`${plural('certificate', certs.length, true)} found ${elapsed(Date.now() - startTime)} under ${chalk.bold(contextName)}`)

    if (certs.length > 0) {
      console.log(formatCertsTable(certs))
    }
  } else if (subcommand === 'add' || subcommand === 'create') {
    if (argv['--overwrite']) {
      error('Overwrite option is deprecated')
      now.close();
      return 1;
    }

    let cert

    if (argv['--crt'] || argv['--key'] || argv['--ca']) {
      if ((args.length !== 0) || (!argv['--crt'] || !argv['--key'] || !argv['--ca'])) {
        error(
          `Invalid number of arguments for a custom certificate entry. Usage: ${chalk.cyan(
            '`now certs add --crt DOMAIN.CRT --key DOMAIN.KEY --ca CA.CRT`'
          )}`
        )
        now.close();
        return 1
      }

      // Read the files provided
      const crt = readX509File(argv['--crt'])
      const key = readX509File(argv['--key'])
      const ca = readX509File(argv['--ca'])

      // Create the certificate
      const cancelWait = wait('Adding your custom certificate');
      cert = await caught(createCustomCert(now, key, crt, ca))
      cancelWait()
    
    } else {
      if (args.length < 1) {
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            '`now certs add <cn>[, <cn>]`'
          )}`
        )
        now.close();
        return 1
      }

      // Create the certificate
      const cancelWait = wait(`Issuing a certificate for ${chalk.bold(args)}`);
      cert = await caught(createCert(now, args))
      cancelWait();
    }

    // Check for errors
    if (cert instanceof Error) {
      error(cert.message);
      now.close();
      return 1;
    }

    // Print success
    const cns = chalk.bold(cert.cns.join(', '))
    success(`Certificate entry for ${cns} ${chalk.gray(`(${cert.uid})`)} created ${elapsed(new Date() - startTime)}`)
  } else if (subcommand === 'renew') {
    error('Renewing certificates is deprecated, issue a new one.')
    return 1
  } else if (subcommand === 'rm' || subcommand === 'remove') {
    if (args.length !== 1) {
      error(
        `Invalid number of arguments. Usage: ${chalk.cyan(
          '`now certs rm <id>`'
        )}`
      );
      now.close();
      return 1;
    }

    const id = args[0]
    const cert = await getCertById(now, id)

    if (!cert) {
      error(`No certificate found by id or cn "${id}" under ${chalk.bold(contextName)}`)
      now.close();
      return 1;
    }

    const yes = await readConfirmation('The following certificate will be removed permanently', cert)
    if (!yes) {
      error('User abort');
      now.close();
      return 0;
    }

    await deleteCertById(now, id)
    success(
      `Certificate ${chalk.bold(
        cert.cns.join(', ')
      )} ${chalk.gray(`(${id})`)} removed ${elapsed(new Date() - startTime)}`
    )
  } else {
    error('Please specify a valid subcommand: ls | add | rm')
    now.close();
    help();
    return 2;
  }

  return now.close()

  function readConfirmation(msg, cert) {
    return new Promise(resolve => {
      const time = chalk.gray(ms(new Date() - new Date(cert.created)) + ' ago')
      
      log(msg)
      print(table([[cert.uid, chalk.bold(cert.cns.join(', ')), time]], {
        align: ['l', 'r', 'l'],
        hsep: ' '.repeat(6)
      }).replace(/^(.*)/gm, '  $1') + '\n')
      print(`${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`)

      process.stdin
        .on('data', d => {
          process.stdin.pause()
          resolve(d.toString().trim().toLowerCase() === 'y')
        })
        .resume()
    })
  }
}

function caught (p) {
  return new Promise(r => {
    p.then(r).catch(r)
  })
}

function readX509File(file) {
  return fs.readFileSync(path.resolve(file), 'utf8')
}

async function getCertById(now, id) {
  return (await getCerts(now)).filter(c => c.uid === id)[0]
}

async function getCerts(now) {
  const { certs } = await now.fetch('/v3/now/certs')
  return certs
}

async function createCert(now, cns) {
  return now.fetch('/v3/now/certs', {
    method: 'POST',
    body: {
      domains: cns
    },
    retry: {
      maxTimeout: 90000,
      minTimeout: 30000,
      retries: 3
    }
  })
}

async function createCustomCert(now, key, cert, ca) {
  return now.fetch('/v3/now/certs', {
    method: 'PUT',
    body: {
      ca, cert, key
    }
  })
}

async function deleteCertById(now, id) {
  return now.fetch(`/v3/now/certs/${id}`, {
    method: 'DELETE',
  })
}

/**
 * This function sorts the list of certs by root domain changing *
 * to 'wildcard' since that will allow psl get the root domain
 * properly to make the comparison.
 */
function sortByCn(certsList) {
  return certsList.concat().sort((a, b) => {
    const domainA = psl.get(a.cns[0].replace('*', 'wildcard'))
    const domainB = psl.get(b.cns[0].replace('*', 'wildcard'))
    if (!domainA || !domainB) return 0;
    return domainA.localeCompare(domainB)
  })
}

function formatCertsTable(certsList) {
  return table([
      formatCertsTableHead(),
      ...formatCertsTableBody(certsList),
    ], {
      align: ['l', 'l', 'r', 'c', 'r'],
      hsep: ' '.repeat(2),
      stringLength: strlen
    }
  ).replace(/^(.*)/gm, '  $1') + '\n'
}

function formatCertsTableHead() {
  return [
    chalk.dim('id'),
    chalk.dim('cns'),
    chalk.dim('expiration'),
    chalk.dim('renew'),
    chalk.dim('age')
  ];
}

function formatCertsTableBody(certsList) {
  const now = new Date();
  return certsList.reduce((result, cert) => ([
    ...result,
    ...formatCert(now, cert)
  ]), [])
}

function formatCert(time, cert) {
  return cert.cns.map((cn, idx) => (
    (idx === 0)
      ? formatCertFirstCn(time, cert, cn, cert.cns.length > 1)
      : formatCertNonFirstCn(cn, cert.cns.length > 1)
  ))
}

function formatCertFirstCn(time, cert, cn, multiple) {
  return [
    cert.uid,
    formatCertCn(cn, multiple),
    formatExpirationDate(new Date(cert.expiration)),
    cert.autoRenew ? 'yes' : 'no',
    chalk.gray(ms(time - new Date(cert.created))),
  ]
}

function formatExpirationDate(date) {
  const diff = date - Date.now()
  return diff < 0
    ? chalk.gray(ms(-diff) + ' ago')
    : chalk.gray('in ' + ms(diff))
}

function formatCertNonFirstCn(cn, multiple) {
  return ['', formatCertCn(cn, multiple), '', '', '']
}

function formatCertCn(cn, multiple) {
  return multiple
    ? `${chalk.gray('-')} ${chalk.bold(cn)}`
    : chalk.bold(cn)
}
