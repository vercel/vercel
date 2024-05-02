/* eslint-disable -- flakey application of `global ReadableStream, TextEncoderStream, Response` eslint directive */

export function GET(_, ctx) {
  console.log(ctx.waitUntil.toString());
  ctx.waitUntil(
    new Promise(resolve => {
      setTimeout(() => {
        console.log('Hello World');
        resolve();
      }, 500);
    })
  );

  return new Response('Hello from Serverless Web!');
}
