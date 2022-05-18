export * from "./call.mjs";
export function createFetch(call, _fetch = global.fetch) {
  return async function ufetch(input, init) {
    const url = input.toString();
    if (!url.startsWith("/")) {
      return _fetch(url, init);
    }
    try {
      const r = await call({ url, ...init });
      return new Response(r.body, {
        status: r.status,
        statusText: r.statusText,
        headers: Object.fromEntries(Object.entries(r.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(",") : value || ""]))
      });
    } catch (error) {
      return new Response(error.toString(), {
        status: parseInt(error.statusCode || error.code) || 500,
        statusText: error.statusText
      });
    }
  };
}
