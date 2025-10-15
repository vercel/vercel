import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'

export const dynamic = 'force-dynamic'
export const revalidate = 60

export default ({ params: { slug } }) => {
  return (
    <Suspense fallback={<Dynamic pathname={`/dynamic/force-dynamic/${slug}`} fallback />}>
      <Dynamic pathname={`/dynamic/force-dynamic/${slug}`} />
    </Suspense>
  )
}
