import { cookies } from 'next/headers';

export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }, { slug: 'third' }];
}

export default async function Page(props) {
  const params = await props.params;

  const {
    slug
  } = params;

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
