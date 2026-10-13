[**@vercel/aws**](../README.md)

---

# Function: createDynamoDBDocument()

> **createDynamoDBDocument**(`opts?`): [`DynamoDBDocumentTableClient`](../type-aliases/DynamoDBDocumentTableClient.md)

Defined in: packages/aws/src/dynamodb.ts:129

Creates a `DynamoDBDocumentClient` pre-configured for a Vercel Marketplace
DynamoDB table. The Document client auto-marshals plain JavaScript values
to/from DynamoDB attribute values. The table name is exposed as
`client.tableName`.

## Parameters

### opts?

[`CreateDynamoDBDocumentOptions`](../interfaces/CreateDynamoDBDocumentOptions.md) = `{}`

## Returns

[`DynamoDBDocumentTableClient`](../type-aliases/DynamoDBDocumentTableClient.md)

## Example

```ts
import { createDynamoDBDocument } from '@vercel/aws';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

const ddb = createDynamoDBDocument();
const result = await ddb.send(
  new GetCommand({ TableName: ddb.tableName, Key: { id: '1' } })
);
```
