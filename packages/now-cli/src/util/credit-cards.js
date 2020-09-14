import stripeFactory from 'stripe';
import Now from '.';

const stripe = stripeFactory('pk_live_alyEi3lN0kSwbdevK0nrGwTw');

export default class CreditCards extends Now {
  async ls() {
    const res = await this._fetch('/stripe/sources/');
    const body = await res.json();

    if (res.status !== 200) {
      const e = new Error(body.error.message);
      e.code = body.error.code;
      throw e;
    }

    return body;
  }

  async setDefault(source) {
    await this._fetch('/stripe/sources/', {
      method: 'POST',
      body: {
        source,
        makeDefault: true,
      },
    });

    return true;
  }

  async rm(source) {
    await this._fetch(`/stripe/sources/`, {
      method: 'DELETE',
      body: { source },
    });

    return true;
  }

  async add(card) {
    if (!card.expDate) {
      throw new Error(`Please define an expiration date for your card`);
    }

    const expDateParts = card.expDate.split(' / ');

    card = {
      name: card.name,
      number: card.cardNumber,
      cvc: card.ccv,
    };

    card.exp_month = expDateParts[0];
    card.exp_year = expDateParts[1];

    try {
      const token = (await stripe.tokens.create({ card })).id;

      const res = await this._fetch('/stripe/sources/', {
        method: 'POST',
        body: {
          source: token,
        },
      });

      const { source, error } = await res.json();

      if (source && source.id) {
        return {
          last4: source.last4,
        };
      } else if (error && error.message) {
        throw new Error(error.message);
      } else {
        throw new Error('Unknown error');
      }
    } catch (err) {
      throw new Error(err.message || 'Unknown error');
    }
  }
}
