import React from 'react'
import Link from 'next/link';
import Learn from './Learn/Learn'

const Home = () => {
  return (
    <ul>
      <li>
        <Link href="/">Home</Link>
      </li>
      <li>
        <Link href="/Learn/learn">Learn</Link>
      </li>
      <li>
        <Link href="/Visuals/visuals">Visuals</Link>
      </li>
    </ul>
  )
}

export default Home
