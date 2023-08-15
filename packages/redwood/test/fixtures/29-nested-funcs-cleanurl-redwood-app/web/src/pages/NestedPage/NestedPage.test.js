import { render } from '@redwoodjs/testing/web'

import NestedPage from './NestedPage'

//   Improve this test with help from the Redwood Testing Doc:
//   https://redwoodjs.com/docs/testing#testing-pages-layouts

describe('NestedPage', () => {
  it('renders successfully', () => {
    expect(() => {
      render(<NestedPage />)
    }).not.toThrow()
  })
})
