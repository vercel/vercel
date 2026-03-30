import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'

export const dynamicParams = false;

const slugs = ['a', 'b', 'c'];

export function generateStaticParams() {
  return slugs.map((slug) => ({  slug  }));
}

export default async function NoFallbackPage(props) {
  const params = await props.params;

  const {
    slug
  } = params;

  return (
    <Suspense fallback={<Dynamic pathname={`/no-fallback/${slug}`} fallback />}>
      <Dynamic pathname={`/no-fallback/${slug}`} />
    </Suspense>
  )
}
