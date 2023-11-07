import React from 'react'
import Link from 'next/link'

const links = [
  { href: '/', tag: 'pre-generated' },
  { href: '/nested/a', tag: 'pre-generated' },
  { href: '/nested/b', tag: 'on-demand' },
  { href: '/nested/c', tag: 'on-demand' },
  { href: '/on-demand/a', tag: 'on-demand, no-gsp' },
  { href: '/on-demand/b', tag: 'on-demand, no-gsp' },
  { href: '/on-demand/c', tag: 'on-demand, no-gsp' },
  { href: '/static', tag: 'static' },
  { href: '/no-suspense', tag: 'no suspense' },
  { href: '/no-suspense/nested/a', tag: 'no suspense, pre-generated' },
  { href: '/no-suspense/nested/b', tag: 'no suspense, on-demand' },
  { href: '/no-suspense/nested/c', tag: 'no suspense, on-demand' },
  { href: '/dynamic/force-dynamic', tag: "dynamic = 'force-dynamic'" },
  { href: '/dynamic/force-static', tag: "dynamic = 'force-static'" },
]

export default ({ children }) => {
  return (
    <html>
      <body>
        <h1>Partial Prerendering</h1>
        <p>
          Below are links that are associated with different pages that all will
          partially prerender
        </p>
        <aside>
          <ul>
            {links.map(({ href, tag }) => (
              <li key={href}>
                <Link href={href}>{href}</Link> <span>{tag}</span>
              </li>
            ))}
          </ul>
        </aside>
        <main>{children}</main>
      </body>
    </html>
  )
}
