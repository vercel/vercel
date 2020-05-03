'use strict'

const fastify = require('fastify')
const routes = require('./_routes/routes')
function build (config) {
  const app = fastify(config)
  app.register(routes)

  return app
}

module.exports = build
