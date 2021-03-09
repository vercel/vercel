import ansiEscapes from 'ansi-escapes';
import chalk from 'chalk';
import ccValidator from 'credit-card';
import textInput from '../../util/input/text';
import cardBrands from '../../util/billing/card-brands';
import success from '../../util/output/success';
import wait from '../../util/output/wait';
import chars from '../../util/output/chars';
import rightPad from '../../util/output/right-pad';
import error from '../../util/output/error';

const expDateMiddleware = data => data;

export default async function({ creditCards, clear = false, contextName }) {
  const state = {
    error: undefined,
    cardGroupLabel: `> ${chalk.bold(
      `Enter your card details for ${chalk.bold(contextName)}`
    )}`,

    name: {
      label: rightPad('Full Name', 12),
      placeholder: 'John Appleseed',
      validateValue: data => data.trim().length > 0,
    },

    cardNumber: {
      label: rightPad('Number', 12),
      mask: 'cc',
      placeholder: '#### #### #### ####',
      validateKeypress: (data, value) => /\d/.test(data) && value.length < 19,
      validateValue: data => {
        data = data.replace(/ /g, '');
        const type = ccValidator.determineCardType(data);
        if (!type) {
          return false;
        }
        return ccValidator.isValidCardNumber(data, type);
      },
    },

    ccv: {
      label: rightPad('CCV', 12),
      mask: 'ccv',
      placeholder: '###',
      validateValue: data => {
        const brand = state.cardNumber.brand.toLowerCase();
        return ccValidator.doesCvvMatchType(data, brand);
      },
    },

    expDate: {
      label: rightPad('Exp. Date', 12),
      mask: 'expDate',
      placeholder: 'mm / yyyy',
      middleware: expDateMiddleware,
      validateValue: data => !ccValidator.isExpired(...data.split(' / ')),
    },
  };

  async function render() {
    for (const key in state) {
      if (!Object.hasOwnProperty.call(state, key)) {
        continue;
      }

      const piece = state[key];

      if (typeof piece === 'string') {
        console.log(piece);
      } else if (typeof piece === 'object') {
        let result;

        try {
          /* eslint-disable no-await-in-loop */
          result = await textInput({
            label: `- ${piece.label}`,
            initialValue: piece.initialValue || piece.value,
            placeholder: piece.placeholder,
            mask: piece.mask,
            validateKeypress: piece.validateKeypress,
            validateValue: piece.validateValue,
            autoComplete: piece.autoComplete,
          });

          piece.value = result;

          if (key === 'cardNumber') {
            let brand = cardBrands[ccValidator.determineCardType(result)];
            piece.brand = brand;

            if (brand === 'American Express') {
              state.ccv.placeholder = '#'.repeat(4);
            } else {
              state.ccv.placeholder = '#'.repeat(3);
            }

            brand = chalk.cyan(`[${brand}]`);
            const masked = chalk.gray('#### '.repeat(3)) + result.split(' ')[3];
            process.stdout.write(
              `${chalk.cyan(chars.tick)} ${piece.label}${masked} ${brand}\n`
            );
          } else if (key === 'ccv') {
            process.stdout.write(
              `${chalk.cyan(chars.tick)} ${piece.label}${'*'.repeat(
                result.length
              )}\n`
            );
          } else if (key === 'expDate') {
            let text = result.split(' / ');
            text = text[0] + chalk.gray(' / ') + text[1];
            process.stdout.write(
              `${chalk.cyan(chars.tick)} ${piece.label}${text}\n`
            );
          } else {
            process.stdout.write(
              `${chalk.cyan(chars.tick)} ${piece.label}${result}\n`
            );
          }
        } catch (err) {
          if (err.message === 'USER_ABORT') {
            process.exit(1);
          } else {
            console.error(error(err));
          }
        }
      }
    }

    console.log(''); // New line
    const stopSpinner = wait('Saving card');

    try {
      const res = await creditCards.add({
        name: state.name.value,
        cardNumber: state.cardNumber.value,
        ccv: state.ccv.value,
        expDate: state.expDate.value,
      });

      stopSpinner();

      if (clear) {
        const linesToClear = state.error ? 15 : 14;
        process.stdout.write(ansiEscapes.eraseLines(linesToClear));
      }

      console.log(
        success(
          `${state.cardNumber.brand ||
            state.cardNumber.card.brand} ending in ${res.last4 ||
            res.card.last4} was added to ${chalk.bold(contextName)}`
        )
      );
    } catch (err) {
      stopSpinner();
      const linesToClear = state.error ? 15 : 14;
      process.stdout.write(ansiEscapes.eraseLines(linesToClear));
      state.error = `${chalk.red('> Error!')} ${
        err.message
      } Please make sure the info is correct`;
      await render();
    }
  }

  try {
    await render();
  } catch (err) {
    console.erorr(err);
  }
}
