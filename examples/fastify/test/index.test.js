'use strict'

const { test } = require('tap')

const buildApp = require('../api/app')

test('app starts', async t => {
  const fastify = buildApp()
  await fastify.ready()
})

test('root', t => {
  t.plan(4)
  const fastify = buildApp()
  fastify.inject('/', (err, res) => {
    t.error(err)
    t.equals(res.payload, 'Hello World!')
  })

  fastify.inject({
    url: '/',
    query: { name: 'foo' }
  }, (err, res) => {
    t.error(err)
    t.equals(res.payload, 'Hello foo!')
  })
})

test('one', t => {
  t.plan(2)
  const fastify = buildApp()
  fastify.inject('/one', (err, res) => {
    t.error(err)
    t.deepEquals(res.json(), { one: 1 })
  })
})

test('two', t => {
  t.plan(4)
  const fastify = buildApp()
  fastify.inject('/two/foo', (err, res) => {
    t.error(err)
    t.deepEquals(res.json(), { two: 'two-foo' })
  })
  fastify.inject('/two/bar', (err, res) => {
    t.error(err)
    t.deepEquals(res.json(), { two: 'two-bar' })
  })
})
