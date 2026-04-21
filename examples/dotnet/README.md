# .NET Starter

Deploy your [.NET](https://dotnet.microsoft.com/) project to Vercel with zero configuration.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/vercel/tree/main/examples/dotnet&template=dotnet)

## Getting Started

Install the [.NET SDK](https://dotnet.microsoft.com/download) and restore dependencies:

```bash
dotnet restore
```

## Running Locally

Start the development server on http://localhost:5000

```bash
dotnet run
```

## Deploying to Vercel

Deploy your project to Vercel with the following command:

```bash
npm install -g vercel
vercel --prod
```

Or `git push` to your repository with our [git integration](https://vercel.com/docs/deployments/git).

To view the source code for this template, [visit the example repository](https://github.com/vercel/vercel/tree/main/examples/dotnet).
