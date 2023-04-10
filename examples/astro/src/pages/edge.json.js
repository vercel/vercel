export async function get() {
  return new Response(JSON.stringify({ time: new Date() }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=10, stale-while-revalidate',
    },
  });
}
