const { GraphQLServerLambda } = require('graphql-yoga');

export const config = {
  awsHandlerName: 'handler',
};

const typeDefs = `
  type Query {
    hello(name: String): String
  }
`;

const resolvers = {
  Query: {
    hello: (_, { name }) => `Hello ${name || 'world'}`,
  },
};

const lambda = new GraphQLServerLambda({
  typeDefs,
  resolvers,
  playground: true,
});

exports.handler = lambda.handler;
