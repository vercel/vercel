# Monorepos on Vercel

## Project Boundaries

Use repository directory mappings when multiple applications have separate Vercel projects. Verify the resolved owner/project from the actual working directory; a directory name or root single-project link does not establish the target. See [project targeting](../SKILL.md#project-targeting) for resolution precedence.

The project's Root Directory is a project setting, not a `vercel.json` property. Keep each app's framework configuration and dependencies in its configured root.

Separate projects suit independently deployed applications, such as a Next.js frontend and Python backend. [Vercel Services](https://vercel.com/docs/services) can host multiple frameworks in one project when they need coordinated deployment and routing. Choose based on those requirements rather than mandating one layout.

## Build Orchestration

Turborepo and Nx need explicit build tasks/targets and correct dependency ordering. Preserve the repository's existing build graph and framework-specific outputs. Vercel can generate framework-aware build commands; use a manual override only when the default does not express the intended app scope.

An ignored build step can skip deployments when the app's dependencies are unchanged. Include dependency graph and cache inputs in a build investigation before assuming that a missing or different build is a deployment failure.
