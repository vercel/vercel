import test from 'ava'
import { mockRequestScope, mockGlobalScope, getEvent, sleep, mockKV, mockManifest } from '../mocks'
mockGlobalScope()

// manually reset manifest global, to test optional behaviour
Object.assign(global, { __STATIC_CONTENT_MANIFEST: undefined })

import { getAssetFromKV, mapRequestToAsset } from '../index'

test('getAssetFromKV return correct val from KV without manifest', async (t) => {
  mockRequestScope()
  // manually reset manifest global, to test optional behaviour
  Object.assign(global, { __STATIC_CONTENT_MANIFEST: undefined })

  const event = getEvent(new Request('https://blah.com/key1.123HASHBROWN.txt'))
  const res = await getAssetFromKV(event)

  if (res) {
    t.is(await res.text(), 'val1')
    t.true(res.headers.get('content-type').includes('text'))
  } else {
    t.fail('Response was undefined')
  }
})
