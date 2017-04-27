const { italic, bold } = require('chalk');

const error = require('../../lib/utils/output/error');
const wait = require('../../lib/utils/output/wait');
const cmd = require('../../lib/utils/output/cmd');
const param = require('../../lib/utils/output/param');
const info = require('../../lib/utils/output/info');
const uid = require('../../lib/utils/output/uid');
const success = require('../../lib/utils/output/success');
const promptBool = require('../../lib/utils/input/prompt-bool');
const eraseLines = require('../../lib/utils/output/erase-lines');
const treatBuyError = require('../../lib/utils/domains/treat-buy-error');

module.exports = async function({domains, args, currentTeam, user}) {
  const name = args[0];

  if (!name) {
    return error(`Missing domain name. Run ${cmd('now domains help')}`);
  }

  const nameParam = param(name);
  let stopSpinner = wait(`Checking availability for ${nameParam}`);

  const price = await domains.price(name);
  const available = await domains.status(name);

  stopSpinner();

  if (!available) {
    return error(`Domain ${nameParam} is ${italic('unavailable')}!`);
  }

  info(`Domain ${nameParam} is ${italic('available')}!`);
  const confirmation = await promptBool(`Buy now for ${bold(`$${price}`)} (${
    bold(
      (currentTeam && currentTeam.slug) || user.username || user.email
    )
  })?`);

  eraseLines(1);
  if (!confirmation) {
    return info('Aborted');
  }

  stopSpinner = wait('Purchasing');
  let domain;
  try {
    domain = await domains.buy(name);
  } catch (err) {
    stopSpinner();
    return treatBuyError(err);
  }

  stopSpinner();
  console.log(domain);
  success(`Domain purchased and created ${uid(domain.uid)}`);
  info(
    `You may now use your domain as an alias to your deployments. Run ${cmd('now alias help')}`
  );
};
