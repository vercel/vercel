import ms from 'ms';
import * as cfg from './cfg';
import pkg from '../../package'; // relative to `build/` :\
import request from 'https';
import chalk from 'chalk';

const TEN_MINUTES = ms('10m');

/**
 * Configures auto updates.
 * Sets up a `exit` listener to report them.
 */

export default function checkUpdate (opts = {}) {
  let updateData;

  const update = check(opts).then((data) => {
    updateData = data;

    // forces the `exit` event upon Ctrl + C
    process.on('SIGINT', () => {
      // clean up output after ^C
      process.stdout.write('\n');
      process.exit(1);
    });
  }, (err) => console.error(err.stack));

  process.on('exit', (code) => {
    if (updateData) {
      const { current, latest, at } = updateData;
      const ago = ms(Date.now() - at);
      console.log(`> ${chalk.white.bgRed('UPDATE NEEDED')} ` +
        `Current: ${current} – ` +
        `Latest ${chalk.bold(latest)} (released ${ago} ago)`);
    }
  });

  return update;
}

function check ({ debug = false, debounce = TEN_MINUTES, timeout = 1000 }) {
  return new Promise((resolve, reject) => {
    const { _last_update_check } = cfg.read();
    if (_last_update_check && _last_update_check + debounce > Date.now()) {
      if (debug) {
        const ago = ms(Date.now() - _last_update_check);
        console.log(`> [debug] Skipping update. Last check ${ago} ago.`);
      }
      return;
    }

    if (debug) console.log(`> [debug] Checking for updates. Timeout in ${ms(timeout)}.`);

    let timer;
    let req = request.get('https://registry.npmjs.org/now', (res) => {
      if (200 !== res.statusCode) {
        if (debug) console.log(`> [debug] Update check error. NPM ${res.statusCode}.`);
        resolve(false);
        return;
      }

      res.resume();

      const bufs = [];

      res.on('data', (buf) => bufs.push(buf));

      res.on('error', (err) => {
        if (debug) console.log(`> [debug] Update check error: ${err.message}.`);
        resolve(false);
      });

      res.on('end', () => {
        clearTimeout(timer);
        const buf = Buffer.concat(bufs);
        let data;

        try {
          data = JSON.parse(buf.toString('utf8'));
        } catch (err) {
          if (debug) console.log(`> [debug] Update check JSON parse error: ${err.message}.`);
          resolve(false);
          return;
        }

        const { latest } = data['dist-tags'];
        const current = pkg.version;

        if (latest !== pkg.version) {
          if (debug) console.log(`> [debug] Needs update. Current ${current}, latest ${latest}`);
          resolve({
            latest,
            current,
            at: new Date(data.time[latest])
          });
        } else {
          if (debug) console.log(`> [debug] Up to date (${pkg.version}).`);
          resolve(false);
        }

        cfg.merge({ _last_update_check: Date.now() });
      });
    })
    .on('error', (err) => {
      if (debug) console.log(`> [debug] Update check error: ${err.message}.`);
      resolve(false);
    });

    timer = setTimeout(() => {
      if (debug) console.log(`> [debug] Aborting update check after ${ms(timeout)}.`);
      req.abort();
      resolve(false);
    }, timeout);
  });
}
