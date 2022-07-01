import handleRequest from '../../../src/App.server';
import indexTemplate from '../../../dist/client/index.html?raw';

// ReadableStream is bugged in Vercel Edge, overwrite with polyfill
import { ReadableStream } from 'web-streams-polyfill/ponyfill';
// eslint-disable-next-line no-undef
Object.assign(globalThis, { ReadableStream });

export default async (request, event) => {
  try {
    return await handleRequest(request, {
      indexTemplate,
      context: event,
    });
  } catch (error) {
    console.log(error);
    // eslint-disable-next-line no-undef
    return new Response(error.message || error.toString());
  }
};
