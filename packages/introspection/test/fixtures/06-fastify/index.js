import Fastify from "fastify";

const fastify = Fastify({ logger: true });

// Declare a route
fastify.get("/", async function handler(request, reply) {
  return "Hello World";
});

fastify.get("/users/:id", async function handler(request, reply) {
  const { id } = request.params;
  return { id };
});

fastify.post("/users", async function handler(request, reply) {
  const { name, email } = request.body;
  return { name, email };
});

fastify.listen({ port: 3000 });
