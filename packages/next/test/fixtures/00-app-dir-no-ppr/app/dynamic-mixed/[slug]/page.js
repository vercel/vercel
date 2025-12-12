import { cookies } from 'next/headers';

export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }, { slug: 'third' }];
}

export default async function Page({ params: { slug } }) {
  if (slug === 'third') {
    // bail to ssr
    await cookies();
  }

  return (
    <>
      <p>hello world</p>
    </>
  );
}
