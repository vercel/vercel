// eslint-disable-next-line no-undef
delete self.__listeners;
export default async () => fetch('https://example.vercel.sh');
export const config = { runtime: 'edge' };
