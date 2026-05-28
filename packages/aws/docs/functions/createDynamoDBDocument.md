[**@vercel/aws**](../README.md)

---

# Function: createDynamoDBDocument()

> **createDynamoDBDocument**(`opts?`): `DynamoDBDocumentClient`

Defined in: [packages/aws/src/dynamodb.ts:108](https://github.com/vercel/vercel/blob/main/packages/aws/src/dynamodb.ts#L108)

Creates a `DynamoDBDocumentClient` pre-configured for a Vercel Marketplace
DynamoDB resource. The Document client auto-marshals plain JavaScript
values to/from DynamoDB attribute values.

## Parameters

### opts?

[`CreateDynamoDBDocumentOptions`](../interfaces/CreateDynamoDBDocumentOptions.md) = `{}`

## Returns

`DynamoDBDocumentClient`

## Example

```ts
import { createDynamoDBDocument } from '@vercel/aws';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

const ddb = createDynamoDBDocument();
const result = await ddb.send(
  new GetCommand({ TableName: 'users', Key: { id: '1' } })
);
```
