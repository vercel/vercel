// @flow
import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import psl from 'psl';
import table from 'text-table';

import Now from '../../util';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import getCerts from '../../util/certs/get-certs';
import strlen from '../../util/strlen';
import { CLIContext, Output } from '../../util/types';
import type { CLICertsOptions } from '../../util/types';

async function ls(
  ctx: CLIContext,
  opts: CLICertsOptions,
  args: string[],
  output: Output
): Promise<number> {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const { contextName } = await getScope({
    apiUrl,
    token,
    debug,
    currentTeam
  });

  // $FlowFixMe
  const now = new Now({ apiUrl, token, debug, currentTeam });
  const lsStamp = stamp();

  if (args.length !== 0) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan('`now certs ls`')}`
    );
    return 1;
  }

  // Get the list of certificates
  const certs = sortByCn(await getCerts(output, now));
  output.log(
    `${plural('certificate', certs.length, true)} found under ${chalk.bold(
      contextName
    )} ${lsStamp()}`
  );

  if (certs.length > 0) {
    console.log(formatCertsTable(certs));
  }
  return 0;
}

function formatCertsTable(certsList) {
  return (
    table([formatCertsTableHead(), ...formatCertsTableBody(certsList)], {
      align: ['l', 'l', 'r', 'c', 'r'],
      hsep: ' '.repeat(2),
      stringLength: strlen
    }).replace(/^(.*)/gm, '  $1') + '\n'
  );
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
  return certsList.reduce(
    (result, cert) => [...result, ...formatCert(now, cert)],
    []
  );
}

function formatCert(time, cert) {
  return cert.cns.map(
    (cn, idx) =>
      idx === 0
        ? formatCertFirstCn(time, cert, cn, cert.cns.length > 1)
        : formatCertNonFirstCn(cn, cert.cns.length > 1)
  );
}

function formatCertNonFirstCn(cn, multiple) {
  return ['', formatCertCn(cn, multiple), '', '', ''];
}

function formatCertCn(cn, multiple) {
  return multiple ? `${chalk.gray('-')} ${chalk.bold(cn)}` : chalk.bold(cn);
}

function formatCertFirstCn(time, cert, cn, multiple) {
  return [
    cert.uid,
    formatCertCn(cn, multiple),
    formatExpirationDate(new Date(cert.expiration)),
    cert.autoRenew ? 'yes' : 'no',
    chalk.gray(ms(time - new Date(cert.created)))
  ];
}

function formatExpirationDate(date) {
  const diff = date - Date.now();
  return diff < 0
    ? chalk.gray(ms(-diff) + ' ago')
    : chalk.gray('in ' + ms(diff));
}

/**
 * This function sorts the list of certs by root domain changing *
 * to 'wildcard' since that will allow psl get the root domain
 * properly to make the comparison.
 */
function sortByCn(certsList) {
  return certsList.concat().sort((a, b) => {
    const domainA = psl.get(a.cns[0].replace('*', 'wildcard'));
    const domainB = psl.get(b.cns[0].replace('*', 'wildcard'));
    if (!domainA || !domainB) return 0;
    return domainA.localeCompare(domainB);
  });
}

export default ls;
