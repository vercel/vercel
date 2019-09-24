const { GraphQLServerLambda } = require('graphql-yoga');

const typeDefs = `
  type Query {
    hello(name: String): String
  }
`;

const resolvers = {
  Query: {
    hello: (_, { name }) => `Hello ${name || "world"}`
  }
};

const lambda = new GraphQLServerLambda({
  typeDefs,
  resolvers,
  playground: true,
});

exports.handler = lambda.handler;
