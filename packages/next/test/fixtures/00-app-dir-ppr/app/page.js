import { headers } from 'next/headers';

export default async function Page() {
  await headers();

  return <p>index app page {Date.now()}</p>;
}
