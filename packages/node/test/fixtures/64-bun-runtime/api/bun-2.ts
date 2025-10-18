export const config = {
  runtime: 'bun'
}

// This route is opted into the Bun runtime via the `config.runtome`  export
export default {
  fetch: () => {
    const runtime = typeof (globalThis as any).Bun !== 'undefined' ? 'bun' : 'node';
    return new Response(JSON.stringify({ runtime }));
  }
}
