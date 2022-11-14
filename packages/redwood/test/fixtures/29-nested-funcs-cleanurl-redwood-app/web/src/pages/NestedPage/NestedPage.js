import { Link, routes } from '@redwoodjs/router'
import { MetaTags } from '@redwoodjs/web'

const NestedPage = () => {
  return (
    <>
      <MetaTags title="Nested" description="Nested page" />

      <h1>NestedPage</h1>
      <p>
        Find me in <code>./web/src/pages/NestedPage/NestedPage.js</code>
      </p>
      <p>
        My default route is named <code>nested</code>, link to me with `
        <Link to={routes.nested()}>Nested</Link>`
      </p>
    </>
  )
}

export default NestedPage
