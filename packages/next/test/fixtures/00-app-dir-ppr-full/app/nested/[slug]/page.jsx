import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'

export default ({ params: { slug } }) => {
  return (
    <Suspense fallback={<Dynamic pathname={`/nested/${slug}`} fallback />}>
      <Dynamic pathname={`/nested/${slug}`} />
    </Suspense>
  )
}

export const generateStaticParams = async () => {
  return [{ slug: 'a' }]
}
