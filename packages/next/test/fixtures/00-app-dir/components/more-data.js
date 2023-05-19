"use client";

import react from 'react'

export const MoreData = () => {
  const [mounted, setMounted] = react.useState(false)
  
  react.useEffect(() => {
    setMounted(true)
  }, [])
  
  return (
    <>
      <p>more data</p>
      {mounted && <p>mounted!</p>}
    </>
  ) 
}
