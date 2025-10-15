import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'

export default async ({ params: { slug } }) => {
  return (
    <Suspense fallback={<Dynamic pathname={`/dynamic/force-static/${slug}`} fallback />}>
      <Dynamic pathname={`/dynamic/force-static/${slug}`} />
    </Suspense>
  )
}
