// @flow
import { Now } from '../types';
import type { CreditCard } from '../types';

export default async function getCreditCards(now: Now) {
  const payload = await now.fetch('/stripe/sources/');
  const cards: CreditCard[] = payload.sources;

  return cards;
}
