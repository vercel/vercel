import mod from '../increment.wasm?module';

export const config = { runtime: 'experimental-edge' };

const init$ = WebAssembly.instantiate(mod);

/** @param {Request} req */
export default async req => {
  const givenNumber = Number(new URL(req.url).searchParams.get('number') || 0);
  const { exports } = await init$;
  const added = exports.add_one(givenNumber);
  return new Response(`${givenNumber} + 1 = ${added}`);
};
