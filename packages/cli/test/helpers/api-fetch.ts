import nodeFetch, { type RequestInit } from '../../src/util/fetch';

export const apiFetch = (
  path: string,
  { headers, ...options }: RequestInit = {}
) => {
  const url = new URL(path, 'https://api.vercel.com');
  if (process.env.VERCEL_TEAM_ID) {
    url.searchParams.set('teamId', process.env.VERCEL_TEAM_ID);
  }
  return nodeFetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      ...(headers || {}),
    },
    ...options,
  });
};
