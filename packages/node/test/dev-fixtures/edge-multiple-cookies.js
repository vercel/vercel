export default async () => {
  const headers = new Headers();
  headers.append('set-cookie', 'a=x');
  headers.append('set-cookie', 'b=y');
  headers.append('set-cookie', 'c=z');
  return new Response('Hello, world!', { headers });
};
export const config = { runtime: 'edge' };
