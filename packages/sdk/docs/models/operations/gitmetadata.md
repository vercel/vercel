# GitMetadata

Populates initial git metadata for different git providers.

## Example Usage

```typescript
import { GitMetadata } from "@vercel/sdk/models/operations";

let value: GitMetadata = {
  remoteUrl: "https://github.com/vercel/next.js",
  commitAuthorName: "kyliau",
  commitMessage:
    "add method to measure Interaction to Next Paint (INP) (#36490)",
  commitRef: "main",
  commitSha: "dc36199b2234c6586ebe05ec94078a895c707e29",
  dirty: true,
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              | Example                                                                                  |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `remoteUrl`                                                                              | *string*                                                                                 | :heavy_minus_sign:                                                                       | The git repository's remote origin url                                                   | https://github.com/vercel/next.js                                                        |
| `commitAuthorName`                                                                       | *string*                                                                                 | :heavy_minus_sign:                                                                       | The name of the author of the commit                                                     | kyliau                                                                                   |
| `commitMessage`                                                                          | *string*                                                                                 | :heavy_minus_sign:                                                                       | The commit message                                                                       | add method to measure Interaction to Next Paint (INP) (#36490)                           |
| `commitRef`                                                                              | *string*                                                                                 | :heavy_minus_sign:                                                                       | The branch on which the commit was made                                                  | main                                                                                     |
| `commitSha`                                                                              | *string*                                                                                 | :heavy_minus_sign:                                                                       | The hash of the commit                                                                   | dc36199b2234c6586ebe05ec94078a895c707e29                                                 |
| `dirty`                                                                                  | *boolean*                                                                                | :heavy_minus_sign:                                                                       | Whether or not there have been modifications to the working tree since the latest commit | true                                                                                     |