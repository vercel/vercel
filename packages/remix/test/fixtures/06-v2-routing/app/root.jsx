import * as React from 'react'
import {Scripts, Outlet} from '@remix-run/react'

export default function Root() {
  return (
    <html>
      <head>
        <title>My Remix App</title>
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
