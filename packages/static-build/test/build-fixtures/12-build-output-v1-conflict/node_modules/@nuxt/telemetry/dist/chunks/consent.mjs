import c from 'chalk';
import inquirer from 'inquirer';
import consola from 'consola';
import { isMinimal } from 'std-env';
import isDocker from 'is-docker';
import { updateUser } from 'rc9';

function updateUserNuxtRc(key, val) {
  updateUser({ [key]: val }, ".nuxtrc");
}

const consentVersion = 1;

async function ensureUserconsent(options) {
  if (options.consent >= consentVersion) {
    return true;
  }
  if (isMinimal || process.env.CODESANDBOX_SSE || process.env.NEXT_TELEMETRY_DISABLED || isDocker()) {
    return false;
  }
  process.stdout.write("\n");
  consola.info(`${c.green("Nuxt")} collects completely anonymous data about usage.
  This will help us improve Nuxt developer experience over time.
  Read more on ${c.cyan.underline("https://github.com/nuxt/telemetry")}
`);
  const { accept } = await inquirer.prompt({
    type: "confirm",
    name: "accept",
    message: "Are you interested in participating?"
  });
  process.stdout.write("\n");
  if (accept) {
    updateUserNuxtRc("telemetry.consent", consentVersion);
    updateUserNuxtRc("telemetry.enabled", true);
    return true;
  }
  updateUserNuxtRc("telemetry.enabled", false);
  return false;
}

export { consentVersion as c, ensureUserconsent as e, updateUserNuxtRc as u };
