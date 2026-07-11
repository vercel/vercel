# Actix Web Starter

Deploy your [Actix Web](https://actix.rs/) project to Vercel with zero configuration.

Visit the [Actix Web documentation](https://actix.rs/docs/) to learn more.

## Getting Started

Make sure you have Rust installed. If not, install it from [rustup.rs](https://rustup.rs/).

Build the project:

```bash
cargo build
```

## Running Locally

Start the development server on http://localhost:3000

```bash
cargo run
```

When you make changes to your project, restart the server to see your changes.

## API Endpoints

- `GET /` - Home page
- `GET /api/data` - Returns sample JSON data
- `GET /api/items/{id}` - Returns a specific item by ID

## Deploying to Vercel

Deploy your project to Vercel with the following command:

```bash
npm install -g vercel
vercel --prod
```

Or `git push` to your repository with our [git integration](https://vercel.com/docs/deployments/git).

## Why Actix Web?

Actix Web is one of the fastest web frameworks available, known for:

- **Performance**: Consistently ranks at the top of web framework benchmarks
- **Actor Model**: Built on the Actix actor framework for concurrent programming
- **Type Safety**: Full Rust type safety with compile-time guarantees
- **Mature Ecosystem**: Large community and extensive middleware support
