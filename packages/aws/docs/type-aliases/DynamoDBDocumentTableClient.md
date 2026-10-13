[**@vercel/aws**](../README.md)

---

# Type Alias: DynamoDBDocumentTableClient

> **DynamoDBDocumentTableClient** = `DynamoDBDocumentClient` & `object`

Defined in: packages/aws/src/dynamodb.ts:62

A `DynamoDBDocumentClient` returned by [createDynamoDBDocument](../functions/createDynamoDBDocument.md), with
the connected table's name attached so it can be passed as `TableName` on
each command.

## Type Declaration

### tableName

> `readonly` **tableName**: `string`

The table name, from `<prefix>_DYNAMODB_TABLE_NAME` or `{ tableName }`.
