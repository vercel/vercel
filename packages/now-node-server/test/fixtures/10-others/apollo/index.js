const express = require('express');
const { ApolloServer, gql } = require('apollo-server-express');

const typeDefs = gql`
  type Query {
    hello: String
  }
`;

const resolvers = {
  Query: {
    hello: () => 'apollo:RANDOMNESS_PLACEHOLDER',
  },
};

const server = new ApolloServer({ typeDefs, resolvers, introspection: true });

const app = express();
server.applyMiddleware({ app });
app.get('/', (req, resp) => {
  resp.redirect('/graphql');
});

app.listen({ port: 4000 });
