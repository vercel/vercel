import { unstable_cacheLife } from 'next/cache';

async function getCachedValue() {
  'use cache';
  unstable_cacheLife('weeks');
  return Math.random();
}

export default async function Page() {
  return <div>This is a cached value: {await getCachedValue()}</div>;
}
