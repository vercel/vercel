[**@vercel/aws**](../README.md)

---

# Function: createDynamoDB()

> **createDynamoDB**(`opts?`): [`DynamoDBTableClient`](../type-aliases/DynamoDBTableClient.md)

Defined in: packages/aws/src/dynamodb.ts:105

Creates a `DynamoDBClient` pre-configured for a Vercel Marketplace
DynamoDB table. The table name is exposed as `client.tableName`.

## Parameters

### opts?

[`CreateDynamoDBOptions`](../interfaces/CreateDynamoDBOptions.md) = `{}`

## Returns

[`DynamoDBTableClient`](../type-aliases/DynamoDBTableClient.md)

## Example

```ts
import { createDynamoDB } from '@vercel/aws';
import { GetItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = createDynamoDB();
const result = await ddb.send(
  new GetItemCommand({ TableName: ddb.tableName, Key: { id: { S: '1' } } })
);
```
