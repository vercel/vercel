import ms from 'ms';
import pkg from '../../package'; // relative to `build/` :\
import fetch from 'node-fetch';
import chalk from 'chalk';

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

function check ({ debug = false }) {
  return new Promise((resolve, reject) => {
    if (debug) console.log('> [debug] Checking for updates.');

    fetch('https://registry.npmjs.org/now').then((res) => {
      if (200 !== res.status) {
        if (debug) console.log(`> [debug] Update check error. NPM ${res.status}.`);
        resolve(false);
        return;
      }

      res.json().then((data) => {
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
      }, () => resolve(false));
    }, () => resolve(false));
  });
}
