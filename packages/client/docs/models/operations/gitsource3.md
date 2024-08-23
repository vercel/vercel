# GitSource3

## Example Usage

```typescript
import { GitSource3 } from '@vercel/client/models/operations';

let value: GitSource3 = {
  type: 'gitlab',
  projectId: 6850.92,
};
```

## Fields

| Field       | Type                                                                                                                                                                           | Required           | Description |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `type`      | [operations.CreateDeploymentGitSourceDeploymentsResponse200ApplicationJSONType](../../models/operations/createdeploymentgitsourcedeploymentsresponse200applicationjsontype.md) | :heavy_check_mark: | N/A         |
| `projectId` | _operations.GitSourceProjectId_                                                                                                                                                | :heavy_check_mark: | N/A         |
| `ref`       | _string_                                                                                                                                                                       | :heavy_minus_sign: | N/A         |
| `sha`       | _string_                                                                                                                                                                       | :heavy_minus_sign: | N/A         |
| `prId`      | _number_                                                                                                                                                                       | :heavy_minus_sign: | N/A         |
