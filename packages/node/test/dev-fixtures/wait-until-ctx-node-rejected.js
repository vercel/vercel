/**
 * Timeout before the waitUntil promise rejects;
 * Must be before the dev server is shut down for a proper test
 * that the serverless function doesn't crash when this happens
 **/
const REJECTION_TIMEOUT = 10;

function lazyError() {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          'Side Effect (via waitUntil) Promise Rejection: intentional rejection'
        )
      );
    }, REJECTION_TIMEOUT);
  });
}

export function GET(_, ctx) {
  ctx.waitUntil(lazyError());
  return Response.json({ keys: Object.keys(ctx) });
}
