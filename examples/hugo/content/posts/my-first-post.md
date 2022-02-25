---
title: 'Deploying to Vercel'
date: 2022-02-21T19:01:19-06:00
draft: true
---

This guide will show you how to deploy a Hugo site and get your domain set up.

[Hugo](https://gohugo.io/) is a very popular framework for creating static websites. It's fast and flexible. To build a Hugo site, start with a template:

- [Hugo](https://vercel.com/new/clone?s=https%3A%2F%2Fgithub.com%2Fvercel%2Fvercel%2Ftree%2Fmain%2Fexamples%2Fhugo&template=hugo&id=67753070&b=main&from=templates)

## Deploy Hugo to Vercel

Vercel is a platform for deploying the fastest Hugo sites. You can deploy your site with zero configuration to the best [frontend infrastructure](https://vercel.com/features/infrastructure).

- Develop: Build Hugo sites that connect to your favorite APIs, databases, and content management systems.
- Preview: Integrate with any GitHub, GitLab, or Bitbucket repository for [instant continuous deployment](https://vercel.com/features/previews).
- Ship: Deploy your site to every edge node worldwide for the fastest Hugo sites. Static files, Serverless and Edge Functions, and [more](https://vercel.com/features/infrastructure).

## Built-in CI/CD for Hugo sites

Vercel has integrations for [GitHub](https://vercel.com/docs/concepts/git/vercel-for-github), [GitLab](https://vercel.com/docs/concepts/git/vercel-for-gitlab), and [Bitbucket](https://vercel.com/docs/concepts/git/vercel-for-bitbucket) to enable CI/CD for your Hugo site with zero configuration. Then, you can run [automated tests for performance and reliability](https://vercel.com/docs/concepts/deployments/checks) on every push. Pull and merge requests are deployed instantly to a unique URL, accessible to your entire team.

## Add your custom domain

After deploying, your new Hugo site will get automatically assigned a `.vercel.app` suffixed domain. You can then add a [Custom Domain](https://vercel.com/docs/concepts/projects/custom-domains) on your choice, either from a third-party or [purchased through Vercel](https://vercel.com/domains).

## Deploy Hugo to Vercel

### Start from a template

- [Hugo](https://vercel.com/new/clone?s=https%3A%2F%2Fgithub.com%2Fvercel%2Fvercel%2Ftree%2Fmain%2Fexamples%2Fhugo&template=hugo&id=67753070&b=main&from=templates)

### Vercel CLI

1.  Install the [Vercel CLI](https://vercel.com/cli) and run `vercel` to deploy.
2.  Vercel will detect that you are using Hugo and will enable the correct settings for your deployment.
3.  Your site is deployed! (e.g. [hugo-template.vercel.app](https://hugo-template.vercel.app/))

### Vercel for Git

1.  Push your code to your git repository (GitHub, GitLab, BitBucket).
2.  [Import your Hugo project](https://vercel.com/new) into Vercel.
3.  Vercel will detect that you are using Hugo and will enable the correct settings for your deployment.
4.  Your site is deployed! (e.g. [hugo-template.vercel.app](https://hugo-template.vercel.app/))
