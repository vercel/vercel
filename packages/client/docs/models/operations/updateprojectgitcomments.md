# UpdateProjectGitComments

## Example Usage

```typescript
import { UpdateProjectGitComments } from '@vercel/client/models/operations';

let value: UpdateProjectGitComments = {
  onPullRequest: false,
  onCommit: false,
};
```

## Fields

| Field           | Type      | Required           | Description                                      |
| --------------- | --------- | ------------------ | ------------------------------------------------ |
| `onPullRequest` | _boolean_ | :heavy_check_mark: | Whether the Vercel bot should comment on PRs     |
| `onCommit`      | _boolean_ | :heavy_check_mark: | Whether the Vercel bot should comment on commits |
