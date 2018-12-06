import chalk from 'chalk';
import Now from '../../util';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import addDNSRecord from '../../util/dns/add-dns-record';
import { DomainNotFound, DNSPermissionDenied } from '../../util/errors';

async function add(
  ctx,
  opts,
  args,
  output
) {
  // eslint-disable-line
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];

  let contextName = null;

  try {
    ({ contextName } = await getScope({
      apiUrl,
      token,
      debug,
      currentTeam
    }));
  } catch (err) {
    if (err.code === 'not_authorized') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  // $FlowFixMe
  const now = new Now({ apiUrl, token, debug, currentTeam });

  const parsedParams = parseAddArgs(args);
  if (!parsedParams) {
    output.error(
      `Invalid number of arguments. See: ${chalk.cyan(
        '`now dns --help`'
      )} for usage.`
    );
    return 1;
  }

  const addStamp = stamp();
  const { domain, data } = parsedParams;
  const record = await addDNSRecord(output, now, domain, data);
  if (record instanceof DomainNotFound) {
    output.error(
      `The domain ${domain} can't be found under ${chalk.bold(
        contextName
      )} ${chalk.gray(addStamp())}`
    );
    return 1;
  } if (record instanceof DNSPermissionDenied) {
    output.error(
      `You don't have permissions to add records to domain ${domain} under ${chalk.bold(
        contextName
      )} ${chalk.gray(addStamp())}`
    );
    return 1;
  }
    console.log(
      `${chalk.cyan('> Success!')} DNS record for domain ${chalk.bold(
        domain
      )} ${chalk.gray(`(${record.uid})`)} created under ${chalk.bold(
        contextName
      )} ${chalk.gray(addStamp())}`
    );


  return 0;
}

function parseAddArgs(args          ) {
  if (!args || args.length < 4) {
    return null;
  }

  const domain = args[0];
  const name = args[1] === '@' ? '' : args[1].toString();
  const type = args[2];
  const value = args[3];

  if (!(domain && typeof name === 'string' && type)) {
    return null;
  } if (type === 'MX' && args.length === 5) {
    return {
      domain,
      data: { name, type, value, mxPriority: Number(args[4]) }
    };
  } if (type === 'SRV' && args.length === 7) {
    return {
      domain,
      data: {
        name,
        type,
        srv: {
          priority: Number(value),
          weight: Number(args[4]),
          port: Number(args[5]),
          target: args[6]
        }
      }
    };
  } if (args.length === 4) {
    return {
      domain,
      data: {
        name,
        type,
        value
      }
    };
  }

  return null;
}

export default add;
