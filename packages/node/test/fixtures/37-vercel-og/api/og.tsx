/** @jsx h */
import { h } from '../jsx-runtime.js';

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default function () {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 128,
          color: 'black',
          background: 'green',
          width: '100%',
          height: '100%',
          display: 'flex',
          textAlign: 'center',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Hello world!
      </div>
    ),
    {
      width: 1200,
      height: 600,
    },
  );
}
