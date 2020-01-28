import fetch from 'node-fetch';
import { Framework } from '@now/frameworks';

export async function getFrameworks(): Promise<Framework[]> {
  const res = await fetch('https://api-frameworks.zeit.sh/api/frameworks');

  if (!res.ok) {
    throw new Error('Could not retrieve frameworks');
  }

  const json: Framework[] = await res.json();

  return json;
}
