export const GET = req => {
  console.log(req.url);
  return new Response('hello world');
};
