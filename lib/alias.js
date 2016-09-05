import Now from './';
import toHost from './to-host';
import chalk from 'chalk';
import isZeitWorld from './is-zeit-world';
import { DOMAIN_VERIFICATION_ERROR } from './errors';
import { resolve4 } from './dns';

const domainRegex = /^((?=[a-z0-9-]{1,63}\.)(xn--)?[a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,63}$/;

export default class Alias extends Now {

  async ls (deployment) {
    if (deployment) {
      const target = await this.findDeployment(deployment);
      if (!target) {
        const err = new Error(`Aliases not found by "${deployment}". Run ${chalk.dim('`now alias ls`')} to see your aliases.`);
        err.userError = true;
        throw err;
      }

      return this.listAliases(target.uid);
    } else {
      return this.listAliases();
    }
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
    // make alias lowercase
    alias = alias.toLowerCase();

    // trim leading and trailing dots
    // for example: `google.com.` => `google.com`
    alias = alias
      .replace(/^\.+/, '')
      .replace(/\.+$/, '');

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

    if (!domainRegex.test(alias)) {
      const err = new Error(`Invalid alias "${alias}"`);
      err.userError = true;
      throw err;
    }

    if (!/\.now\.sh$/.test(alias)) {
      console.log(`> ${chalk.bold(chalk.underline(alias))} is a custom domain.`);
      console.log(`> Verifying the DNS settings for ${chalk.bold(chalk.underline(alias))} (see ${chalk.underline('https://zeit.world')} for help)`);

      const { domain, nameservers } = await this.getNameservers(alias);
      if (this._debug) console.log(`> [debug] Found domain ${domain} and nameservers ${nameservers}`);

      try {
        await this.verifyOwnership(alias);
      } catch (err) {
        if (err.userError) {
          // a user error would imply that verification failed
          // in which case we attempt to correct the dns
          // configuration (if we can!)
          try {
            if (isZeitWorld(nameservers)) {
              console.log(`> Detected ${chalk.bold(chalk.underline('zeit.world'))} nameservers! Configuring records.`);
              const record = alias.substr(0, alias.length - domain.length);

              // lean up trailing and leading dots
              const _record = record
                .replace(/^\./, '')
                .replace(/\.$/, '');
              const _domain = domain
                .replace(/^\./, '')
                .replace(/\.$/, '');

              if (_record === '') {
                await this.setupRecord(_domain, '*');
              }

              await this.setupRecord(_domain, _record);

              this.recordSetup = true;
              console.log('> DNS Configured! Verifying propagation…');

              try {
                await this.retry(() => this.verifyOwnership(alias), { retries: 10, maxTimeout: 8000 });
              } catch (err2) {
                const e = new Error('> We configured the DNS settings for your alias, but we were unable to ' +
                            'verify that they\'ve propagated. Please try the alias again later.');
                e.userError = true;
                throw e;
              }
            } else {
              console.log(`> Resolved IP: ${err.ip ? `${chalk.underline(err.ip)} (unknown)` : chalk.dim('none')}`);
              console.log(`> Nameservers: ${nameservers && nameservers.length ? nameservers.map(ns => chalk.underline(ns)).join(', ') : chalk.dim('none')}`);
              throw err;
            }
          } catch (e) {
            if (e.userError) throw e;
            throw err;
          }
        } else {
          throw err;
        }
      }

      if (!isZeitWorld(nameservers)) {
        if (this._debug) console.log(`> [debug] Trying to register a non-ZeitWorld domain ${domain} for the current user`);
        await this.setupDomain(domain, { isExternal: true });
      }

      console.log(`> Verification ${chalk.bold('OK')}!`);
    }

    const { created, uid } = await this.createAlias(depl, alias);
    if (created) {
      console.log(`${chalk.cyan('> Success!')} Alias created ${chalk.dim(`(${uid})`)}: ${chalk.bold(chalk.underline(`https://${alias}`))} now points to ${chalk.bold(`https://${depl.url}`)} ${chalk.dim(`(${depl.uid})`)}`);
    } else {
      console.log(`${chalk.cyan('> Success!')} Alias already exists ${chalk.dim(`(${uid})`)}.`);
    }
  }

  createAlias (depl, alias) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) console.time(`> [debug] /now/deployments/${depl.uid}/aliases #${attempt}`);
      const res = await this._fetch(`/now/deployments/${depl.uid}/aliases`, {
        method: 'POST',
        body: { alias }
      });

      const body = await res.json();
      if (this._debug) console.timeEnd(`> [debug] /now/deployments/${depl.uid}/aliases #${attempt}`);

      // 409 conflict is returned if it already exists
      if (409 === res.status) return { uid: body.error.uid };

      // no retry on authorization problems
      if (403 === res.status) {
        const code = body.error.code;

        if ('custom_domain_needs_upgrade' === code) {
          const err = new Error(`Custom domains are only enabled for premium accounts. Please upgrade at ${chalk.underline('https://zeit.co/account')}.`);
          err.userError = true;
          return bail(err);
        }

        if ('alias_in_use' === code) {
          const err = new Error(`The alias you are trying to configure (${chalk.underline(chalk.bold(alias))}) is already in use by a different account.`);
          err.userError = true;
          return bail(err);
        }

        if ('forbidden' === code) {
          const err = new Error('The domain you are trying to use as an alias is already in use by a different account.');
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
          console.log(`> Provisioning certificate for ${chalk.underline(chalk.bold(alias))}`);

          try {
            await this.createCert(alias);
          } catch (err) {
            // we bail to avoid retrying the whole process
            // of aliasing which would involve too many
            // retries on certificate provisioning
            return bail(err);
          }

          // try again, but now having provisioned the certificate
          return this.createAlias(depl, alias);
        }

        return bail(new Error(body.error.message));
      }

      // the two expected succesful cods are 200 and 304
      if (200 !== res.status && 304 !== res.status) {
        throw new Error('Unhandled error');
      }

      return body;
    });
  }

  async setupRecord (domain, name) {
    await this.setupDomain(domain);

    if (this._debug) console.log(`> [debug] Setting up record "${name}" for "${domain}"`);
    const type = '' === name ? 'ALIAS' : 'CNAME';
    return this.retry(async (bail, attempt) => {
      if (this._debug) console.time(`> [debug] /domains/${domain}/records #${attempt}`);
      const res = await this._fetch(`/domains/${domain}/records`, {
        method: 'POST',
        body: {
          type,
          name: '' === name ? name : '*',
          value: 'alias.zeit.co'
        }
      });
      if (this._debug) console.timeEnd(`> [debug] /domains/${domain}/records #${attempt}`);

      if (403 === res.status) {
        return bail(new Error('Unauthorized'));
      }

      const body = await res.json();

      if (200 !== res.status) {
        throw new Error(body.error.message);
      }

      return body;
    });
  }

  verifyOwnership (domain) {
    return this.retry(async (bail, attempt) => {
      const targets = await resolve4('alias.zeit.co');

      if (!targets.length) {
        return bail(new Error('Unable to resolve alias.zeit.co'));
      }

      let ips = [];
      try {
        ips = await resolve4(domain);
      } catch (err) {
        if ('ENODATA' === err.code || 'ESERVFAIL' === err.code || 'ENOTFOUND' === err.code) {
          // not errors per se, just absence of records
          if (this._debug) console.log(`> [debug] No records found for "${domain}"`);
        } else {
          throw err;
        }
      }

      if (!ips.length) {
        const err = new Error(DOMAIN_VERIFICATION_ERROR);
        err.userError = true;
        return bail(err);
      }

      for (const ip of ips) {
        if (!~targets.indexOf(ip)) {
          const err = new Error(`The domain ${domain} has an A record ${chalk.bold(ip)} that doesn\'t resolve to ${chalk.bold(chalk.underline('alias.zeit.co'))}.\n> ` + DOMAIN_VERIFICATION_ERROR);
          err.ip = ip;
          err.userError = true;
          return bail(err);
        }
      }
    });
  }

  createCert (domain) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) console.time(`> [debug] /now/certs #${attempt}`);
      const res = await this._fetch('/now/certs', {
        method: 'POST',
        body: {
          domains: [domain]
        }
      });

      if (304 === res.status) {
        console.log('> Certificate already issued.');
        return;
      }

      const body = await res.json();
      if (this._debug) console.timeEnd(`> [debug] /now/certs #${attempt}`);

      if (body.error) {
        const { code } = body.error;

        if ('verification_failed' === code) {
          const err = new Error('The certificate issuer failed to verify ownership of the domain. ' +
            'This likely has to do with DNS propagation and caching issues. Please retry later!');
          err.userError = true;
          // retry
          throw err;
        } else if ('rate_limited' === code) {
          const err = new Error(body.error.message);
          err.userError = true;
          // dont retry
          return bail(err);
        }

        throw new Error(body.error.message);
      }

      if (200 !== res.status && 304 !== res.status) {
        throw new Error('Unhandled error');
      }
    }, { retries: 5, minTimeout: 30000, maxTimeout: 90000 });
  }

}
