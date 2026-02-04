# Interface: GetVercelOidcTokenOptions

Options for getting the Vercel OIDC token.

## Table of contents

### Properties

- [projectId](GetVercelOidcTokenOptions.md#projectid)
- [teamId](GetVercelOidcTokenOptions.md#teamid)

## Properties

### projectId

• `Optional` **projectId**: `string`

Optional project ID to use for token refresh.
When provided, this project ID will be used instead of reading from `.vercel/project.json`.

#### Defined in

[get-vercel-oidc-token.ts:17](https://github.com/vercel/vercel/blob/main/packages/oidc/src/get-vercel-oidc-token.ts#L17)

---

### teamId

• `Optional` **teamId**: `string`

Optional team ID to use for token refresh.
When provided, this team ID will be used instead of reading from `.vercel/project.json`.

#### Defined in

[get-vercel-oidc-token.ts:12](https://github.com/vercel/vercel/blob/main/packages/oidc/src/get-vercel-oidc-token.ts#L12)
