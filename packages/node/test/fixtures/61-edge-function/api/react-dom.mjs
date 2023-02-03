import React from 'react';
import { renderToString } from 'react-dom/server';

export const config = {
  runtime: 'edge'
};

export default async () => {
  const el = React.createElement('h1', { children: `RANDOMNESS_PLACEHOLDER:Hello from Edge` });
  const str = renderToString(el);
  return new Response(str, {
    headers: {
      'content-type': 'text/html'
    }
  });
}
