function lazyError() {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          'Side Effect (via waitUntil) Promise Rejection: intentional rejection'
        )
      );
    }, 10);
  });
}

export function GET(_, ctx) {
  ctx.waitUntil(lazyError());
  return Response.json({ keys: Object.keys(ctx) });
}
