function lazyError() {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('oh no'));
    }, 100);
  });
}

export function GET(_, ctx) {
  ctx.waitUntil(lazyError());
  return Response.json({ keys: Object.keys(ctx) });
}
