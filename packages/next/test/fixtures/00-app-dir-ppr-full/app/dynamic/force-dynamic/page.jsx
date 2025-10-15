import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'
import { headers } from 'next/headers'

export default async ({ params: { slug } }) => {
  await headers()
  
  return (
    <Suspense fallback={<Dynamic pathname={`/dynamic/force-dynamic/${slug}`} fallback />}>
      <Dynamic pathname={`/dynamic/force-dynamic/${slug}`} />
    </Suspense>
  )
}
