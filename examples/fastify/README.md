# fastify

Deploy a Fastify instance to [Vercel Serverless-functions](https://vercel.com/docs/v2/serverless-functions/introduction#).  
All the Fastify features like routing, hooks and decorators are supported!

## Creating This Example

To get started with a Fastify server on Vercel, you can use [Now CLI](https://vercel.com/download) to initialize the project:

```shell
$ now init fastify
```

## Deploying This Example

Once initialized, you can deploy the example with just a single command:

```shell
$ now
```

This demo will expose some demo routes:

- `${now-url}/`: hello world
- `${now-url}?name=foo`: hello foo
- `${now-url}/one`: routing example
- `${now-url}/two/foo`: routing example with path parameters
