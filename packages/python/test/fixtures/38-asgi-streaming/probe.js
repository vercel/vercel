const assert = require('assert');

/**
 * Custom streaming probe to verify incremental delivery from ASGI routes (raw ASGI and Starlette).
 * Each handler writes an intro line, then numbers 1..5 with ~1s delay.
 * Also tests Server-Sent Events (SSE) streaming.
 */
module.exports = async ({ deploymentUrl, fetch }) => {
  // Test regular streaming
  await checkStreaming(`https://${deploymentUrl}/api/stream_asgi`, fetch);
  await checkStreaming(`https://${deploymentUrl}/api/stream_starlette`, fetch);

  // Test SSE streaming
  await checkSSE(`https://${deploymentUrl}/api/sse_asgi`, fetch);
  await checkSSE(`https://${deploymentUrl}/api/sse_starlette`, fetch);
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
          return validateTimings(url, start, numberArrivalTimes, 'streamed line');
        }
      }
    }
  }

  clearTimeout(timeout);
  return validateTimings(url, start, numberArrivalTimes, 'streamed line');
}

async function checkSSE(url, fetch) {
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

  // Verify SSE headers
  const contentType = res.headers.get('content-type');
  assert(
    contentType && contentType.includes('text/event-stream'),
    `Expected Content-Type: text/event-stream from ${url}, got ${contentType}`
  );

  const start = Date.now();
  const eventArrivalTimes = new Map();
  let buffer = '';

  // Read response body incrementally
  for await (const chunk of res.body) {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);

    // Process complete SSE messages (terminated by double newline)
    while (true) {
      const idx = buffer.indexOf('\n\n');
      if (idx === -1) break;

      const message = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      // Parse SSE data field
      const lines = message.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          const num = parseInt(data, 10);

          if (!Number.isNaN(num)) {
            if (!eventArrivalTimes.has(num)) {
              eventArrivalTimes.set(num, Date.now());
            }

            // Stop early once we've observed all expected events
            if (eventArrivalTimes.size >= 5) {
              clearTimeout(timeout);
              return validateTimings(url, start, eventArrivalTimes, 'SSE event');
            }
          }
        }
      }
    }
  }

  clearTimeout(timeout);
  return validateTimings(url, start, eventArrivalTimes, 'SSE event');
}

function validateTimings(url, start, arrivalTimes, label) {
  // Ensure all events 1..5 were observed
  for (let i = 1; i <= 5; i++) {
    assert(
      arrivalTimes.has(i),
      `Did not observe ${label} for number ${i} from ${url}`
    );
  }

  const first = arrivalTimes.get(1) - start;
  const last = arrivalTimes.get(5) - start;

  // First event should arrive quickly (streaming started)
  assert(
    first < 2000,
    `First ${label} from ${url} arrived too late (${first}ms) — response may be buffered`
  );

  // Overall duration between 1 and 5 should be at least ~4s (4 sleeps),
  // but keep an upper bound to catch excessive buffering or stalls.
  const duration = last - (arrivalTimes.get(1) - start);
  assert(
    duration >= 3500 && duration <= 20000,
    `Unexpected ${label} streaming duration from 1->5 for ${url}: ${duration}ms`
  );
}
