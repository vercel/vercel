export default req => {
  const url = new URL(req.url);
  return new Response(null, {
    status: 302,
    headers: {
      location: `https://vercel.com${url.pathname}${url.search}`,
    },
  });
};
