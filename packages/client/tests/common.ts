const {
  fetchCachedToken,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('../../../test/lib/deployment/now-deploy.js');

export async function generateNewToken(): Promise<string> {
  const token = await fetchCachedToken();
  return token;
}

export function sleep(ms: number) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
