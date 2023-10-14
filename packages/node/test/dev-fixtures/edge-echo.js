/* global Response */
export const config = { runtime: 'edge' };
/**
 * @param {Request} req
 * @returns {Response}
 */
export default async req => {
  return new Response(await req.text());
};
