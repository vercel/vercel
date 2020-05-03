'use strict'

module.exports = function fastifyRoutes (fastify, opts, next) {
  fastify.get('/', async (req, res) => {
    const { name = 'World' } = req.query
    req.log.info({ name }, 'hello world!')
    return `Hello ${name}!`
  })

  fastify.get('/one', async () => { return { one: 1 } })
  fastify.get('/two/:foo', async (req) => { return { two: `two-${req.params.foo}` } })

  next()
}
