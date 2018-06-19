// @flow
import { Now } from '../types'
import type { CreditCard } from '../types'

export default async function getCreditCards(now: Now) {
  const payload = await now.fetch('/cards')
  const cards: CreditCard[] = payload.cards
  return cards;
}
