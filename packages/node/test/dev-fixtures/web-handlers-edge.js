/* global ReadableStream, TextEncoderStream, Response */

export const config = { runtime: 'edge' };

const DEFER_MS = 10;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const streaming =
  text =>
  (_, { waitUntil }) => {
    const DATA = text.split(' ');
    let index = 0;

    const readable = new ReadableStream({
      async start(controller) {
        while (index < DATA.length) {
          const data = DATA[index++];
          let chunk = data;
          if (index !== DATA.length) chunk += ' ';
          controller.enqueue(chunk);
          await wait(DEFER_MS);
        }
        controller.close();
      },
    }).pipeThrough(new TextEncoderStream());

    waitUntil(wait(DATA.length * DEFER_MS));

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain',
        'x-web-handler': text,
      },
    });
  };

export const GET = streaming('Web handler using GET');

export const HEAD = streaming('Web handler using HEAD');

export const OPTIONS = streaming('Web handler using OPTIONS');

export const POST = streaming('Web handler using POST');

export const PUT = streaming('Web handler using PUT');

export const DELETE = streaming('Web handler using DELETE');

export const PATCH = streaming('Web handler using PATCH');
