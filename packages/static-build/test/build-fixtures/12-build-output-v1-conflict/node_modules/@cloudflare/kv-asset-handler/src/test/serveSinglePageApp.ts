import test from 'ava'
import { mockRequestScope, mockGlobalScope } from '../mocks'
mockGlobalScope()

import { serveSinglePageApp } from '../index'

function testRequest(path: string) {
  mockRequestScope()
  let url = new URL('https://example.com')
  url.pathname = path
  let request = new Request(url.toString())

  return request
}

test('serveSinglePageApp returns root asset path when request path ends in .html', async (t) => {
  let path = '/foo/thing.html'
  let request = testRequest(path)

  let expected_request = testRequest('/index.html')
  let actual_request = serveSinglePageApp(request)

  t.deepEqual(expected_request, actual_request)
})

test('serveSinglePageApp returns root asset path when request path does not have extension', async (t) => {
  let path = '/foo/thing'
  let request = testRequest(path)

  let expected_request = testRequest('/index.html')
  let actual_request = serveSinglePageApp(request)

  t.deepEqual(expected_request, actual_request)
})

test('serveSinglePageApp returns requested asset when request path has non-html extension', async (t) => {
  let path = '/foo/thing.js'
  let request = testRequest(path)

  let expected_request = request
  let actual_request = serveSinglePageApp(request)

  t.deepEqual(expected_request, actual_request)
})
