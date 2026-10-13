[**@vercel/aws**](../README.md)

---

# Type Alias: DynamoDBTableClient

> **DynamoDBTableClient** = `DynamoDBClient` & `object`

Defined in: packages/aws/src/dynamodb.ts:52

A `DynamoDBClient` returned by [createDynamoDB](../functions/createDynamoDB.md), with the connected
table's name attached so it can be passed as `TableName` on each command.

## Type Declaration

### tableName

> `readonly` **tableName**: `string`

The table name, from `<prefix>_DYNAMODB_TABLE_NAME` or `{ tableName }`.
