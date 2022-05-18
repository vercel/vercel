import test from 'ava'
import { mockRequestScope, mockGlobalScope } from '../mocks'
mockGlobalScope()

import { mapRequestToAsset } from '../index'

test('mapRequestToAsset() correctly changes /about -> /about/index.html', async (t) => {
  mockRequestScope()
  let path = '/about'
  let request = new Request(`https://foo.com${path}`)
  let newRequest = mapRequestToAsset(request)
  t.is(newRequest.url, request.url + '/index.html')
})

test('mapRequestToAsset() correctly changes /about/ -> /about/index.html', async (t) => {
  mockRequestScope()
  let path = '/about/'
  let request = new Request(`https://foo.com${path}`)
  let newRequest = mapRequestToAsset(request)
  t.is(newRequest.url, request.url + 'index.html')
})

test('mapRequestToAsset() correctly changes /about.me/ -> /about.me/index.html', async (t) => {
  mockRequestScope()
  let path = '/about.me/'
  let request = new Request(`https://foo.com${path}`)
  let newRequest = mapRequestToAsset(request)
  t.is(newRequest.url, request.url + 'index.html')
})

test('mapRequestToAsset() correctly changes /about -> /about/default.html', async (t) => {
  mockRequestScope()
  let path = '/about'
  let request = new Request(`https://foo.com${path}`)
  let newRequest = mapRequestToAsset(request, { defaultDocument: 'default.html' })
  t.is(newRequest.url, request.url + '/default.html')
})
