import { render } from '@redwoodjs/testing/web'

import LandingLayout from './LandingLayout'

//   Improve this test with help from the Redwood Testing Doc:
//   https://redwoodjs.com/docs/testing#testing-pages-layouts

describe('LandingLayout', () => {
  it('renders successfully', () => {
    expect(() => {
      render(<LandingLayout />)
    }).not.toThrow()
  })
})
