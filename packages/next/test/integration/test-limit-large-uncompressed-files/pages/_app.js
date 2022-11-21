/* eslint-disable */
import React from 'react';

if (typeof window === 'undefined') {
  try {
    const fs = require('fs');
    const path = require('path');
    fs.readdirSync(path.join(process.cwd(), 'public'));
    fs.readdirSync(path.join(process.cwd(), 'node_modules/chrome-aws-lambda'));
    fs.readdirSync(path.join(process.cwd(), 'node_modules/firebase'));
  } catch (_) {}
}

export default function MyApp({ Component, pageProps }) {
  return React.createElement(Component, pageProps);
}
