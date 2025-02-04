export const config = { runtime: 'edge' };

export default async req => {
  return new Response(await req.text());
};
