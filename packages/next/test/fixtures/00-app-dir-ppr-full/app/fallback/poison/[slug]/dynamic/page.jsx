import { headers } from 'next/headers';
import { Suspense } from 'react';

async function Agent() {
  return <div data-agent>{(await headers()).get('user-agent')}</div>;
}

export default async function Page(props) {
  const { slug } = await props.params;

  return (
    <>
      <div data-page data-slug={slug}>
        This is the validation page: {slug}
      </div>
      <Suspense>
        <Agent />
      </Suspense>
    </>
  );
}
