/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configurations can be added here
}

module.exports = nextConfig
// @ts-check
const { withBlitz } = require("@blitzjs/next")

/**
 * @type {import('@blitzjs/next').BlitzConfig}
 **/
const config = {}

module.exports = withBlitz(config)
