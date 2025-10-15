import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'

export default async ({ params: { slug } }) => {
  return (
    <Suspense fallback={<Dynamic pathname={`/dynamic/force-dynamic/${slug}`} fallback />}>
      <Dynamic pathname={`/dynamic/force-dynamic/${slug}`} />
    </Suspense>
  )
}
