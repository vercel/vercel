import fetch from 'node-fetch';
const str = 'aHR0cHM6Ly9hcGktdG9rZW4tZmFjdG9yeS56ZWl0LnNo';

async function fetchTokenWithRetry(url: string, retries = 3): Promise<string> {
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.token;
  } catch (error) {
    console.log(`Failed to fetch token. Retries remaining: ${retries}`);
    if (retries === 0) {
      throw error;
    }
    await sleep(500);
    return fetchTokenWithRetry(url, retries - 1);
  }
}

export async function generateNewToken(): Promise<string> {
  const token = await fetchTokenWithRetry(
    Buffer.from(str, 'base64').toString()
  );
  return token;
}

export function sleep(ms: number) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
