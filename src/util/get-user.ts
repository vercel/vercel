import fetch from 'node-fetch';
import debugFactory from 'debug';
import { User } from '../types';
import { InvalidToken, MissingUser } from './errors-ts';

const debug = debugFactory('now:sh:get-user');

export default async function getUser({ apiUrl, token }: { apiUrl: string, token: string }) {
  debug('GET /www/user');
  let res;

  try {
    res = await fetch(`${apiUrl  }/www/user`, { headers: {
      Authorization: `Bearer ${token}`
    } });
  } catch (err) {
    debug(`error fetching /www/user: $O`, err.stack);
    throw new Error(
      `An unexpected error occurred while trying to fetch your user information: ${err.message}`
    );
  }

  debug('parsing response from GET /www/user');
  let body;

  try {
    body = await res.json();
  } catch (err) {
    debug(
      `error parsing the response from /www/user as JSON – got %O`,
      err.stack
    );
    throw new Error(
      `An unexpected error occurred while trying to fetch your personal details: ${err.message}`
    );
  }

  if (body.error && body.error.code === 'forbidden') {
    throw new InvalidToken();
  }

  const { user }: { user?: User } = body;
  if (!user) {
    throw new MissingUser();
  }

  // this is pretty much useless
  delete user.billingChecked;
  return user;
};
