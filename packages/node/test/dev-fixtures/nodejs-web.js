/* global Response */

export const config = { runtime: 'nodejs-web' };

const baseUrl = ({ headers }) =>
  `${headers.get('x-forwarded-proto')}://${headers.get('x-forwarded-host')}`;

export default request => {
  const { searchParams } = new URL(request.url, baseUrl(request));
  const name = searchParams.get('name');
  return new Response(`Greetings, ${name}`);
};
