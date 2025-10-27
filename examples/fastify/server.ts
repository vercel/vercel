import Fastify from 'fastify'

const fastify = Fastify({ logger: true })

// Declare a route
fastify.get('/', async function handler (request, reply) {
  reply.type('text/html')
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Fastify on Vercel</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: linear-gradient(135deg, #000 0%, #111 100%);
          color: #fff;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          text-align: center;
          max-width: 600px;
          padding: 2rem;
        }
        .logo {
          width: 120px;
          height: 120px;
          border-radius: 12px;
          margin: 0 auto 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 1.5rem;
        }
        h1 {
          font-size: 3rem;
          font-weight: 700;
          margin-bottom: 1rem;
          color: white;
        }
        p {
          font-size: 1.125rem;
          color: #888;
          margin-bottom: 2rem;
          line-height: 1.6;
        }
        .features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          margin-top: 2rem;
        }
        .feature {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 1rem;
          backdrop-filter: blur(10px);
        }
        .feature h3 {
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }
        .feature a {
          font-size: 1rem;
          color: white;
          margin: 0;
          text-decoration: none;
        }
        .feature a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <img src="https://api-frameworks.vercel.sh/framework-logos/fastify-dark.svg" alt="Fastify logo" class="logo" />
        <h1>Welcome to Fastify</h1>
        <p>A fast and low overhead web framework running on Vercel</p>
        <div class="features">
          <div class="feature">
            <a href="https://vercel.com/docs/frameworks/fastify" target="_blank" rel="noreferrer">Vercel docs</a>
          </div>
          <div class="feature">
            <a href="https://fastify.dev" target="_blank" rel="noreferrer">Fastify docs</a>
          </div>
        </div>
      </div>
    </body>
    </html>
    `
})

fastify.listen({ port: 3000 })
