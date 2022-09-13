# Sanity Blogging Content Studio

Congratulations, you have now installed Sanity Studio, an open source real-time content editing environment connected to the Sanity backend.

Now you can do the following things:

- [Read “getting started” in the docs](https://www.sanity.io/docs/introduction/getting-started?utm_source=readme)
- Check out the example frontend: [React/Next.js](https://github.com/sanity-io/tutorial-sanity-blog-react-next)
- [Read the blog post about this template](https://www.sanity.io/blog/build-your-own-blog-with-sanity-and-next-js?utm_source=readme)
- [Join the community Slack](https://slack.sanity.io/?utm_source=readme)
- [Extend and build plugins](https://www.sanity.io/docs/content-studio/extending?utm_source=readme)

## Develop locally

Install dependencies:

```sh
npx @sanity/cli install
```

Pull down environment variables from your Vercel project (requires the [Vercel CLI](https://vercel.com/cli)):

```sh
vercel env pull
```



You can also run `npx @sanity/init` in this repo and agree to reconfigure it. You'll then be able to select from existing projects. The CLI will update `sanity.json` with the project ID and dataset name.
