const assert = require('assert');

/**
 * Custom streaming probe to verify incremental delivery from WSGI routes (Flask and raw WSGI).
 * Each handler writes an intro line, then numbers 1..5 with ~1s delay.
 */
module.exports = async ({ deploymentUrl, fetch }) => {
  await checkStreaming(`https://${deploymentUrl}/api/flask_app`, fetch);
  await checkStreaming(`https://${deploymentUrl}/api/wsgi_app`, fetch);
};

async function checkStreaming(url, fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }

  assert.strictEqual(res.status, 200, `Expected 200 from ${url}, got ${res.status}`);

  const start = Date.now();
  const numberArrivalTimes = new Map();
  let buffer = '';

  // Read response body incrementally
  for await (const chunk of res.body) {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);

    // Process complete lines
    while (true) {
      const idx = buffer.indexOf('\n');
      if (idx === -1) break;
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);

      const num = parseInt(line, 10);
      if (!Number.isNaN(num)) {
        if (!numberArrivalTimes.has(num)) {
          numberArrivalTimes.set(num, Date.now());
        }
        // Stop early once we've observed all expected numbers
        if (numberArrivalTimes.size >= 5) {
          clearTimeout(timeout);
          return validateTimings(url, start, numberArrivalTimes);
        }
      }
    }
  }

  clearTimeout(timeout);
  return validateTimings(url, start, numberArrivalTimes);
}

function validateTimings(url, start, numberArrivalTimes) {
  // Ensure all numbers 1..5 were observed
  for (let i = 1; i <= 5; i++) {
    assert(
      numberArrivalTimes.has(i),
      `Did not observe streamed line for number ${i} from ${url}`
    );
  }

  const first = numberArrivalTimes.get(1) - start;
  const last = numberArrivalTimes.get(5) - start;

  // First number should arrive quickly (streaming started)
  assert(
    first < 2000,
    `First number from ${url} arrived too late (${first}ms) — response may be buffered`
  );

  // Overall duration between 1 and 5 should be at least ~4s (4 sleeps),
  // but keep an upper bound to catch excessive buffering or stalls.
  const duration = last - (numberArrivalTimes.get(1) - start);
  assert(
    duration >= 3500 && duration <= 20000,
    `Unexpected streaming duration from 1->5 for ${url}: ${duration}ms`
  );
}
