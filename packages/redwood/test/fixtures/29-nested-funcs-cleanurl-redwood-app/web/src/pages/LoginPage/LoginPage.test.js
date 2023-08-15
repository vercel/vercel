import { render } from '@redwoodjs/testing/web'

import LoginPage from './LoginPage'

//   Improve this test with help from the Redwood Testing Doc:
//   https://redwoodjs.com/docs/testing#testing-pages-layouts

describe('LoginPage', () => {
  it.skip('renders successfully', () => {
    expect(() => {
      render(<LoginPage />)
    }).not.toThrow()
  })
})
