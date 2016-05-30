import retry from 'async-retry';
import dns from 'dns';
import Now from '../lib';
import toHost from './to-host';
import chalk from 'chalk';

export default class Alias extends Now {

  async ls (deployment) {
    if (deployment) {
      const target = await this.findDeployment(deployment);
      if (!target) {
        const err = new Error(`Aliases not found by "${deployment}". Run ${chalk.dim('`now alias ls`')} to see your aliases.`);
        err.userError = true;
        throw err;
      }

      return this.retry(async (bail, attempt) => {
        const res = await this._fetch(`/now/deployments/${target.uid}/aliases`);
        const body = await res.json();
        return body.aliases;
      });
    }

    return this.retry(async (bail, attempt) => {
      const res = await this._fetch('/now/aliases');
      const body = await res.json();
      return body.aliases;
    });
  }

  async rm (_alias) {
    return this.retry(async (bail, attempt) => {
      const res = await this._fetch(`/now/aliases/${_alias.uid}`, {
        method: 'DELETE'
      });

      if (403 === res.status) {
        return bail(new Error('Unauthorized'));
      }

      if (res.status !== 200) {
        const err = new Error('Deletion failed. Try again later.');
        throw err;
      }
    });
  }

  async findDeployment (deployment) {
    const list = await this.list();
    let key, val;
    if (/\./.test(deployment)) {
      val = toHost(deployment);
      key = 'url';
    } else {
      val = deployment;
      key = 'uid';
    }

    const depl = list.find((d) => {
      if (d[key] === val) {
        if (this._debug) console.log(`> [debug] matched deployment ${d.uid} by ${key} ${val}`);
        return true;
      }

      // match prefix
      if (`${val}.now.sh` === d.url) {
        if (this._debug) console.log(`> [debug] matched deployment ${d.uid} by url ${d.url}`);
        return true;
      }

      return false;
    });

    return depl;
  }

  async set (deployment, alias) {
    const depl = await this.findDeployment(deployment);
    if (!depl) {
      const err = new Error(`Deployment not found by "${deployment}". Run ${chalk.dim('`now ls`')} to see your deployments.`);
      err.userError = true;
      throw err;
    }

    // evaluate the alias
    if (!/\./.test(alias)) {
      if (this._debug) console.log(`> [debug] suffixing \`.now.sh\` to alias ${alias}`);
      alias = `${alias}.now.sh`;
    } else {
      alias = toHost(alias);
    }

    await this.createAlias(depl, alias);
    console.log(`${chalk.cyan('> Success!')} Set up alias ${chalk.bold(alias)}`);
  }

  async createAlias (depl, alias) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) console.time(`> [debug] /now/deployments/${depl.uid}/aliases #${attempt}`);
      const res = await this._fetch(`/now/deployments/${depl.uid}/aliases`, {
        method: 'POST',
        body: { alias }
      });

      if (304 === res.status) return;

      const body = await res.json();
      if (this._debug) console.timeEnd(`> [debug] /now/deployments/${depl.uid}/aliases #${attempt}`);

      // no retry on authorization problems
      if (403 === res.status) {
        const code = body.error.code;

        if ('custom_domain_needs_upgrade' === code) {
          const err = new Error(`You are attempting to use a custom domain alias (${chalk.underline(chalk.cyan(alias))}), but this is only enabled for premium accounts. Please upgrade at ${chalk.underline('https://zeit.co/account')}`);
          err.userError = true;
          return bail(err);
        }

        if ('alias_in_use' === code) {
          const err = new Error(`The alias you are trying to configure (${chalk.underline(chalk.cyan(alias))}) is already in use by a different account.`);
          err.userError = true;
          return bail(err);
        }

        return bail(new Error('Authorization error'));
      }

      // all other errors
      if (body.error) {
        const code = body.error.code;

        if ('deployment_not_found' === code) {
          return bail(new Error('Deployment not found'));
        }

        if ('cert_missing' === code) {
          console.log(`> Provisioning certificate for ${chalk.underline(chalk.cyan(alias))}`);

          await this.verifyOwnership();
          await this.createCert();

          // try again, but now having provisioned the certificate
          return this.createAlias(depl, alias);
        }

        return bail(new Error(body.error.message));
      }

      // the two expected succesful cods are 200 and 304
      if (200 !== res.status && 304 !== res.status) {
        throw new Error('Unhandled error');
      }
    });
  }

  async verifyOwnership (domain) {
    return this.retry(async (bail, attempt) => {
      const targets = await resolve4('alias.zeit.co');

      if (!targets.length) {
        return bail(new Error('Unable to resolve alias.zeit.co'));
      }

      const ips = await resolve4(domain);
      if (!ips.length) {
        const err = new Error('The domain ${domain} A record in the DNS configuration is not returning any IPs.');
        err.userError = true;
        return bail(err);
      }

      for (const ip of ips) {
        if (!~targets.indexOf(ip)) {
          const err = new Error(`The domain ${domain} has an A record ${chalk.bold(ip)} that doesn\'t resolve to ${chalk.bold('alias.zeit.co')}. Make sure the appropriate \`ALIAS\` or \`CNAME\` records are configured.`);
          err.userError = true;
          return bail(err);
        }
      }
    });
  }

  async createCert (domain) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) console.time(`> [debug] /certs #${attempt}`);
      const res = await this._fetch('/certs', {
        method: 'POST',
        body: {
          domains: [domain]
        }
      });

      const body = await res.json();
      if (this._debug) console.timeEnd(`> [debug] /certs #${attempt}`);

      if (body.error) {
        const { code } = body.error;

        if ('verification_failed' === code) {
          const err = new Error(`We couldn't verify ownership of the domain ${domain}. Make sure the appropriate \`ALIAS\` or \`CNAME\` records are configured and pointing to ${chalk.bold('alias.zeit.co')}.`);
          err.userError = true;
          return bail(err);
        }

        throw new Error(body.message);
      }

      if (200 !== res.status && 304 !== res.status) {
        throw new Error('Unhandled error');
      }
    });
  }

  retry (fn) {
    return retry(fn, { retries: 5, randomize: true, onRetry: this._onRetry });
  }

}

function resolve4 (host) {
  return new Promise((resolve, reject) => {
    return dns.resolve4(host, (err, answer) => {
      if (err) return reject(err);
      resolve(answer);
    });
  });
}
