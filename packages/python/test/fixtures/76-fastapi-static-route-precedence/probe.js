module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  // `@app.get("/static/example.txt")` is declared BEFORE `app.mount("/static",
  // StaticFiles(...))`, so the API route must win for that exact path (path
  // operations are evaluated in order). The current builder copies the whole
  // `static/` directory to the CDN and serves it via the filesystem handler
  // before the Lambda, wrongly returning `STATIC_FILE_WRONGLY_WON`.
  const collide = await fetch(`https://${deploymentUrl}/static/example.txt`);
  const collideBody = await collide.text();
  if (collide.status !== 200) failures.push(`collision: expected 200, got ${collide.status}`);
  if (!collideBody.includes('API_ROUTE_WON')) {
    failures.push(
      `collision: expected API_ROUTE_WON (route declared before mount), got ${JSON.stringify(collideBody)}`
    );
  }

  // A static file not shadowed by any route is still served from the CDN. A
  // repeated request should report `x-vercel-cache: HIT`.
  const plain = await fetch(`https://${deploymentUrl}/static/plain.txt`);
  const plainBody = await plain.text();
  if (plain.status !== 200) failures.push(`plain: expected 200, got ${plain.status}`);
  if (!plainBody.includes('PLAIN_STATIC_ASSET')) {
    failures.push(`plain: expected PLAIN_STATIC_ASSET, got ${JSON.stringify(plainBody)}`);
  }
  // Warm the cache, then confirm the second response is a CDN hit.
  await fetch(`https://${deploymentUrl}/static/plain.txt`);
  const cdnRes = await fetch(`https://${deploymentUrl}/static/plain.txt`);
  const cacheHeader = cdnRes.headers.get('x-vercel-cache');
  if (cacheHeader !== 'HIT') {
    failures.push(`cdn: expected x-vercel-cache: HIT, got ${JSON.stringify(cacheHeader)}`);
  }

  // HEAD is not a method of the GET-only route (FastAPI doesn't add HEAD), so it
  // mismatches there; the StaticFiles mount (a full path match) then serves the
  // file for HEAD via the Lambda (200, no body).
  const head = await fetch(`https://${deploymentUrl}/static/example.txt`, {
    method: 'HEAD',
  });
  if (head.status !== 200) failures.push(`head: expected 200, got ${head.status}`);

  // POST is not GET/HEAD: the shadowed path still reaches the Lambda, where the
  // GET route is a method mismatch and the StaticFiles mount answers 405.
  const post = await fetch(`https://${deploymentUrl}/static/example.txt`, {
    method: 'POST',
  });
  if (post.status !== 405) {
    const body = await post.text();
    failures.push(`method: expected 405 for POST, got ${post.status} ${JSON.stringify(body)}`);
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
