// This route is not opted into the Bun runtime
export default {
  fetch: () => {
    const runtime = typeof (globalThis as any).Bun !== 'undefined' ? 'bun' : 'node';
    return new Response(JSON.stringify({ runtime }));
  }
}
