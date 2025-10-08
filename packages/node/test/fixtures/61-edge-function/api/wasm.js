import wasm from '../increment.wasm?module';

export const config = {
  runtime: 'experimental-edge',
};

const initialized = WebAssembly.instantiate(wasm);

export default async _req => {
  const { exports } = await initialized;
  const eleven = exports.add_one(10);
  return new Response(`RANDOMNESS_PLACEHOLDER:edge, ${eleven}.`);
};
