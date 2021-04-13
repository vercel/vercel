import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import { error } from '../../util/error';
import NowCreditCards from '../../util/credit-cards';
import indent from '../../util/indent';
import listInput from '../../util/input/list';
import success from '../../util/output/success';
import promptBool from '../../util/input/prompt-bool';
import info from '../../util/output/info';
import logo from '../../util/output/logo';
import addBilling from './add';
import exit from '../../util/exit';
import getScope from '../../util/get-scope.ts';
import { getPkgName } from '../../util/pkg-name.ts';
import getArgs from '../../util/get-args.ts';
import handleError from '../../util/handle-error.ts';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} billing`)} [options] <command>

  ${chalk.dim('Options:')}

    ls                   Show all of your credit cards
    add                  Add a new credit card
    rm            [id]   Remove a credit card
    set-default   [id]   Make a credit card your default one

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -S, --scope                    Set a custom scope

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a new credit card (interactively)

      ${chalk.cyan(`$ ${getPkgName()} billing add`)}
  `);
};

let argv;
let debug;
let apiUrl;
let subcommand;

export default async client => {
  try {
    argv = getArgs(client.argv.slice(2), {});
  } catch (error) {
    handleError(error);
    return 1;
  }

  argv._ = argv._.slice(1);

  debug = argv['--debug'];
  apiUrl = client.apiUrl;
  subcommand = argv._[0];

  if (argv['--help'] || !subcommand) {
    help();
    return 2;
  }

  const {
    output,
    authConfig: { token },
    config: { currentTeam },
  } = client;

  const start = new Date();
  const creditCards = new NowCreditCards({
    apiUrl,
    token,
    debug,
    currentTeam,
    output,
  });

  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const args = argv._.slice(1);

  switch (subcommand) {
    case 'ls':
    case 'list': {
      let cards;

      try {
        cards = await creditCards.ls();
      } catch (err) {
        console.error(error(err.message));
        return 1;
      }

      const text = cards.sources
        .map(source => {
          const _default =
            source.id === cards.defaultSource
              ? ` ${chalk.bold('(default)')}`
              : '';
          const id = `${chalk.gray('-')} ${chalk.cyan(
            `ID: ${source.id}`
          )}${_default}`;
          const number = `${chalk.gray('#### ').repeat(3)}${
            source.last4 || source.card.last4
          }`;

          return [
            id,
            indent(source.name || source.owner.name, 2),
            indent(`${source.brand || source.card.brand} ${number}`, 2),
          ].join('\n');
        })
        .join('\n\n');

      const elapsed = ms(new Date() - start);
      console.log(
        `> ${plural(
          'card',
          cards.sources.length,
          true
        )} found under ${chalk.bold(contextName)} ${chalk.gray(`[${elapsed}]`)}`
      );
      if (text) {
        console.log(`\n${text}\n`);
      }

      break;
    }

    case 'set-default': {
      if (args.length > 1) {
        console.error(error('Invalid number of arguments'));
        return 1;
      }

      const start = new Date();

      let cards;
      try {
        cards = await creditCards.ls();
      } catch (err) {
        console.error(error(err.message));
        return 1;
      }

      if (cards.sources.length === 0) {
        console.error(error('You have no credit cards to choose from'));
        return 0;
      }

      let cardId = args[0];

      if (cardId === undefined) {
        const elapsed = ms(new Date() - start);
        const message = `Selecting a new default payment card for ${chalk.bold(
          contextName
        )} ${chalk.gray(`[${elapsed}]`)}`;
        const choices = buildInquirerChoices(cards);

        cardId = await listInput({
          message,
          choices,
          separator: true,
          abort: 'end',
        });
      }

      // Check if the provided cardId (in case the user
      // typed `vercel billing set-default <some-id>`) is valid
      if (cardId) {
        const label = `Are you sure that you to set this card as the default?`;
        const confirmation = await promptBool(label, {
          trailing: '\n',
        });

        if (!confirmation) {
          console.log(info('Aborted'));
          break;
        }

        const start = new Date();
        await creditCards.setDefault(cardId);

        const card = cards.sources.find(card => card.id === cardId);
        const elapsed = ms(new Date() - start);
        console.log(
          success(
            `${card.brand || card.card.brand} ending in ${
              card.last4 || card.card.last4
            } is now the default ${chalk.gray(`[${elapsed}]`)}`
          )
        );
      } else {
        console.log('No changes made');
      }

      break;
    }

    case 'rm':
    case 'remove': {
      if (args.length > 1) {
        console.error(error('Invalid number of arguments'));
        return 1;
      }

      const start = new Date();
      let cards;
      try {
        cards = await creditCards.ls();
      } catch (err) {
        console.error(error(err.message));
        return 1;
      }

      if (cards.sources.length === 0) {
        console.error(
          error(
            `You have no credit cards to choose from to delete under ${chalk.bold(
              contextName
            )}`
          )
        );
        return 0;
      }

      let cardId = args[0];

      if (cardId === undefined) {
        const elapsed = ms(new Date() - start);
        const message = `Selecting a card to ${chalk.underline(
          'remove'
        )} under ${chalk.bold(contextName)} ${chalk.gray(`[${elapsed}]`)}`;
        const choices = buildInquirerChoices(cards);

        cardId = await listInput({
          message,
          choices,
          separator: true,
          abort: 'start',
        });
      }

      // Shoud check if the provided cardId (in case the user
      // typed `vercel billing rm <some-id>`) is valid
      if (cardId) {
        const label = `Are you sure that you want to remove this card?`;
        const confirmation = await promptBool(label);
        if (!confirmation) {
          console.log('Aborted');
          break;
        }
        const start = new Date();
        await creditCards.rm(cardId);

        const deletedCard = cards.sources.find(card => card.id === cardId);
        const remainingCards = cards.sources.filter(card => card.id !== cardId);

        let text = `${deletedCard.brand || deletedCard.card.brand} ending in ${
          deletedCard.last4 || deletedCard.card.last4
        } was deleted`;
        //  ${chalk.gray(`[${elapsed}]`)}

        if (cardId === cards.defaultSource) {
          if (remainingCards.length === 0) {
            // The user deleted the last card in their account
            text += `\n${chalk.yellow('Warning!')} You have no default card`;
          } else {
            // We can't guess the current default card – let's ask the API
            const cards = await creditCards.ls();
            const newDefaultCard = cards.sources.find(
              card => card.id === cards.defaultCardId
            );

            text += `\n${
              newDefaultCard.brand || newDefaultCard.card.brand
            } ending in ${
              newDefaultCard.last4 || newDefaultCard.card.last4
            } in now default for ${chalk.bold(contextName)}`;
          }
        }

        const elapsed = ms(new Date() - start);
        text += ` ${chalk.gray(`[${elapsed}]`)}`;
        console.log(success(text));
      } else {
        console.log('No changes made');
      }

      break;
    }

    case 'add': {
      await addBilling({
        creditCards,
        contextName,
      });

      break;
    }

    default:
      console.error(
        error('Please specify a valid subcommand: ls | add | rm | set-default')
      );
      help();
      return 1;
  }

  // This is required, otherwise we get those weird zlib errors
  return exit(0);
};

// Builds a `choices` object that can be passesd to inquirer.prompt()
function buildInquirerChoices(cards) {
  return cards.sources.map(source => {
    const _default =
      source.id === cards.defaultSource ? ` ${chalk.bold('(default)')}` : '';
    const id = `${chalk.cyan(`ID: ${source.id}`)}${_default}`;
    const number = `${chalk.gray('#### ').repeat(3)}${
      source.last4 || source.card.last4
    }`;
    const str = [
      id,
      indent(source.name || source.owner.name, 2),
      indent(`${source.brand || source.card.brand} ${number}`, 2),
    ].join('\n');

    return {
      name: str, // Will be displayed by Inquirer
      value: source.id, // Will be used to identify the answer
      short: source.id, // Will be displayed after the users answers
    };
  });
}
