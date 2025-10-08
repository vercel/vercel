import { render } from '@lit-labs/ssr/lib/render-with-global-dom-shim.js';
import { html } from 'lit';

export default async (_req, res) => {
  const who = html`<b>it works!</b>`;
  const hello = html`Hello lit: ${who}`;
  const result = render(hello);
  let str = '';
  for await (const value of result) str += value;
  return res.end(str);
};
