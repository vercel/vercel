export default {
  fetch: () => {
    const runtime = typeof (globalThis as any).Bun !== 'undefined' ? 'bun' : 'node';
    return new Response(JSON.stringify({ runtime }));
  }
}
