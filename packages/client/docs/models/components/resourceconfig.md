# ResourceConfig

An object containing infomation related to the amount of platform resources may be allocated to the User account.

## Example Usage

```typescript
import { ResourceConfig } from '@vercel/client/models/components';

let value: ResourceConfig = {};
```

## Fields

| Field                                       | Type       | Required           | Description                                                                                                       |
| ------------------------------------------- | ---------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `blobStores`                                | _number_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `nodeType`                                  | _string_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `concurrentBuilds`                          | _number_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `awsAccountType`                            | _string_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `awsAccountIds`                             | _string_[] | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `cfZoneName`                                | _string_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `imageOptimizationType`                     | _string_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `edgeConfigs`                               | _number_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `edgeConfigSize`                            | _number_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `edgeFunctionMaxSizeBytes`                  | _number_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `edgeFunctionExecutionTimeoutMs`            | _number_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `serverlessFunctionDefaultMaxExecutionTime` | _number_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `kvDatabases`                               | _number_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `postgresDatabases`                         | _number_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `integrationStores`                         | _number_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `cronJobs`                                  | _number_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
| `cronJobsPerProject`                        | _number_   | :heavy_minus_sign: | An object containing infomation related to the amount of platform resources may be allocated to the User account. |
