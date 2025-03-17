import { headers } from 'next/headers';

export function generateStaticParams() {
  return [
    {
      slug: ['static'],
    },
    {
      slug: ['dynamic'],
    },
  ];
}

export default function Page({ params }) {
  if (params.slug?.[0] === 'dynamic') {
    console.log('calling headers to trigger dynamic for', params);
    headers();
  }

  return (
    <>
      <p>catch-all /[[...slug]]</p>
      <p>{JSON.stringify(params)}</p>
    </>
  );
}
