[**@vercel/aws**](../README.md)

---

# Function: createDynamoDB()

> **createDynamoDB**(`opts?`): `DynamoDBClient`

Defined in: [packages/aws/src/dynamodb.ts:81](https://github.com/vercel/vercel/blob/main/packages/aws/src/dynamodb.ts#L81)

Creates a `DynamoDBClient` pre-configured for a Vercel Marketplace
DynamoDB resource.

## Parameters

### opts?

[`CreateDynamoDBOptions`](../interfaces/CreateDynamoDBOptions.md) = `{}`

## Returns

`DynamoDBClient`

## Example

```ts
import { createDynamoDB } from '@vercel/aws';
import { GetItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = createDynamoDB();
const result = await ddb.send(
  new GetItemCommand({ TableName: 'users', Key: { id: { S: '1' } } })
);
```
