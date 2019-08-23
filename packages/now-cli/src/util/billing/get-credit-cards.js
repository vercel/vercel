//

export default async function getCreditCards(now) {
  const payload = await now.fetch('/stripe/sources/');
  const cards = payload.sources;

  return cards;
}
