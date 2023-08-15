import { getDirectiveName } from '@redwoodjs/testing/api'

import skipAuth from './skipAuth'

describe('skipAuth directive', () => {
  it.skip('declares the directive sdl as schema, with the correct name', () => {
    expect(skipAuth.schema).toBeTruthy()
    expect(getDirectiveName(skipAuth.schema)).toBe('skipAuth')
  })
})
