# vercel init

Initialize example Vercel projects.

## Synopsis

```bash
vercel init [example] [dir] [options]
```

## Description

The `init` command creates a new project from Vercel's example templates. If no example is specified, an interactive selector is shown.

## Arguments

| Argument  | Required | Description                              |
| --------- | -------- | ---------------------------------------- |
| `example` | No       | Example name or GitHub URL               |
| `dir`     | No       | Target directory (default: example name) |

## Options

| Option    | Shorthand | Type    | Description                               |
| --------- | --------- | ------- | ----------------------------------------- |
| `--force` | `-f`      | Boolean | Overwrite destination directory if exists |

## Examples

### Interactive Selection

```bash
vercel init
```

Shows a list of available examples to choose from.

### Initialize Specific Example

```bash
vercel init nextjs
vercel init remix
vercel init astro
```

### Initialize to Custom Directory

```bash
vercel init nextjs my-app
vercel init remix ./projects/my-remix-app
```

### Force Overwrite

```bash
vercel init nextjs my-existing-dir --force
```

---

## Popular Examples

| Example     | Framework | Description                |
| ----------- | --------- | -------------------------- |
| `nextjs`    | Next.js   | React framework            |
| `remix`     | Remix     | Full-stack React framework |
| `astro`     | Astro     | Content-focused framework  |
| `sveltekit` | SvelteKit | Svelte framework           |
| `nuxt`      | Nuxt      | Vue framework              |
| `vite`      | Vite      | Build tool starter         |
| `express`   | Express   | Node.js API                |

---

## From GitHub

Initialize from any GitHub repository:

```bash
vercel init https://github.com/user/repo
vercel init user/repo
```

---

## After Initialization

```bash
# Initialize example
vercel init nextjs my-app

# Enter directory
cd my-app

# Install dependencies
npm install

# Start development
vercel dev
# or
npm run dev

# Deploy
vercel deploy
```

---

## See Also

- [deploy](deploy.md) - Deploy your project
- [dev](dev.md) - Local development
- [link](link.md) - Link to Vercel project
