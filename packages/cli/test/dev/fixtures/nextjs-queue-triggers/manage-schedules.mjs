import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sdkDirectory, operation] = process.argv.slice(2);
assert(sdkDirectory && operation, 'Provide the SDK directory and a JSON operation');
const { method, params } = JSON.parse(operation);
assert(['create', 'list', 'get', 'update', 'delete', 'enable', 'disable', 'invoke'].includes(method));
const { Schedules } = await import(
  pathToFileURL(resolve(sdkDirectory, 'dist/index.js')).href
);
try {
  console.log(JSON.stringify({ result: await Schedules[method](params) }));
} catch (error) {
  if (typeof error.status !== 'number') throw error;
  console.log(JSON.stringify({ error: { status: error.status, message: error.message } }));
}
