# Interface: WebSocket

[index](../modules/index.md).WebSocket

## Hierarchy

- `WebSocketAlias`

  ↳ **`WebSocket`**

## Table of contents

### Properties

- [CLOSED](index.WebSocket.md#closed)
- [CLOSING](index.WebSocket.md#closing)
- [CONNECTING](index.WebSocket.md#connecting)
- [OPEN](index.WebSocket.md#open)
- [binaryType](index.WebSocket.md#binarytype)
- [bufferedAmount](index.WebSocket.md#bufferedamount)
- [extensions](index.WebSocket.md#extensions)
- [isPaused](index.WebSocket.md#ispaused)
- [onclose](index.WebSocket.md#onclose)
- [onerror](index.WebSocket.md#onerror)
- [onmessage](index.WebSocket.md#onmessage)
- [onopen](index.WebSocket.md#onopen)
- [protocol](index.WebSocket.md#protocol)
- [readyState](index.WebSocket.md#readystate)
- [url](index.WebSocket.md#url)

### Methods

- [[captureRejectionSymbol]](index.WebSocket.md#[capturerejectionsymbol])
- [addEventListener](index.WebSocket.md#addeventlistener)
- [addListener](index.WebSocket.md#addlistener)
- [close](index.WebSocket.md#close)
- [emit](index.WebSocket.md#emit)
- [eventNames](index.WebSocket.md#eventnames)
- [getMaxListeners](index.WebSocket.md#getmaxlisteners)
- [listenerCount](index.WebSocket.md#listenercount)
- [listeners](index.WebSocket.md#listeners)
- [off](index.WebSocket.md#off)
- [on](index.WebSocket.md#on)
- [once](index.WebSocket.md#once)
- [pause](index.WebSocket.md#pause)
- [ping](index.WebSocket.md#ping)
- [pong](index.WebSocket.md#pong)
- [prependListener](index.WebSocket.md#prependlistener)
- [prependOnceListener](index.WebSocket.md#prependoncelistener)
- [rawListeners](index.WebSocket.md#rawlisteners)
- [removeAllListeners](index.WebSocket.md#removealllisteners)
- [removeEventListener](index.WebSocket.md#removeeventlistener)
- [removeListener](index.WebSocket.md#removelistener)
- [resume](index.WebSocket.md#resume)
- [send](index.WebSocket.md#send)
- [setMaxListeners](index.WebSocket.md#setmaxlisteners)
- [terminate](index.WebSocket.md#terminate)

## Properties

### CLOSED

• `Readonly` **CLOSED**: `3`

The connection is closed.

#### Inherited from

WebSocketAlias.CLOSED

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:72

---

### CLOSING

• `Readonly` **CLOSING**: `2`

The connection is in the process of closing.

#### Inherited from

WebSocketAlias.CLOSING

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:70

---

### CONNECTING

• `Readonly` **CONNECTING**: `0`

The connection is not yet open.

#### Inherited from

WebSocketAlias.CONNECTING

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:66

---

### OPEN

• `Readonly` **OPEN**: `1`

The connection is open and ready to communicate.

#### Inherited from

WebSocketAlias.OPEN

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:68

---

### binaryType

• **binaryType**: `"nodebuffer"` \| `"arraybuffer"` \| `"fragments"`

#### Inherited from

WebSocketAlias.binaryType

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:51

---

### bufferedAmount

• `Readonly` **bufferedAmount**: `number`

#### Inherited from

WebSocketAlias.bufferedAmount

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:52

---

### extensions

• `Readonly` **extensions**: `string`

#### Inherited from

WebSocketAlias.extensions

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:53

---

### isPaused

• `Readonly` **isPaused**: `boolean`

Indicates whether the websocket is paused

#### Inherited from

WebSocketAlias.isPaused

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:55

---

### onclose

• **onclose**: `null` \| (`event`: `CloseEvent`) => `void`

#### Inherited from

WebSocketAlias.onclose

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:76

---

### onerror

• **onerror**: `null` \| (`event`: `ErrorEvent`) => `void`

#### Inherited from

WebSocketAlias.onerror

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:75

---

### onmessage

• **onmessage**: `null` \| (`event`: `MessageEvent`) => `void`

#### Inherited from

WebSocketAlias.onmessage

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:77

---

### onopen

• **onopen**: `null` \| (`event`: `Event`) => `void`

#### Inherited from

WebSocketAlias.onopen

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:74

---

### protocol

• `Readonly` **protocol**: `string`

#### Inherited from

WebSocketAlias.protocol

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:56

---

### readyState

• `Readonly` **readyState**: `0` \| `2` \| `1` \| `3`

The current state of the connection

#### Inherited from

WebSocketAlias.readyState

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:58

---

### url

• `Readonly` **url**: `string`

#### Inherited from

WebSocketAlias.url

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:63

## Methods

### [captureRejectionSymbol]

▸ `Optional` **[captureRejectionSymbol]**(`error`, `event`, `...args`): `void`

#### Parameters

| Name      | Type                                                                                              |
| :-------- | :------------------------------------------------------------------------------------------------ |
| `error`   | [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) |
| `event`   | `string`                                                                                          |
| `...args` | `any`[]                                                                                           |

#### Returns

`void`

#### Inherited from

WebSocketAlias.[captureRejectionSymbol]

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/events.d.ts:112

---

### addEventListener

▸ **addEventListener**<`K`\>(`type`, `listener`, `options?`): `void`

#### Type parameters

| Name | Type                              |
| :--- | :-------------------------------- |
| `K`  | extends keyof `WebSocketEventMap` |

#### Parameters

| Name       | Type                                                                                                              |
| :--------- | :---------------------------------------------------------------------------------------------------------------- |
| `type`     | `K`                                                                                                               |
| `listener` | (`event`: `WebSocketEventMap`[`K`]) => `void` \| { `handleEvent`: (`event`: `WebSocketEventMap`[`K`]) => `void` } |
| `options?` | `EventListenerOptions`                                                                                            |

#### Returns

`void`

#### Inherited from

WebSocketAlias.addEventListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:117

---

### addListener

▸ **addListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                             |
| :--------- | :----------------------------------------------- |
| `event`    | `"close"`                                        |
| `listener` | (`code`: `number`, `reason`: `Buffer`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.addListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:171

▸ **addListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                                                                   |
| :--------- | :--------------------------------------------------------------------------------------------------------------------- |
| `event`    | `"error"`                                                                                                              |
| `listener` | (`error`: [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.addListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:172

▸ **addListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                     |
| :--------- | :--------------------------------------- |
| `event`    | `"upgrade"`                              |
| `listener` | (`request`: `IncomingMessage`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.addListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:173

▸ **addListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                                            |
| :--------- | :---------------------------------------------------------------------------------------------- |
| `event`    | `"message"`                                                                                     |
| `listener` | (`data`: [`WebSocketData`](../modules/index.md#websocketdata), `isBinary`: `boolean`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.addListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:174

▸ **addListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type         |
| :--------- | :----------- |
| `event`    | `"open"`     |
| `listener` | () => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.addListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:175

▸ **addListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                         |
| :--------- | :--------------------------- |
| `event`    | `"ping"` \| `"pong"`         |
| `listener` | (`data`: `Buffer`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.addListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:176

▸ **addListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                    |
| :--------- | :------------------------------------------------------ |
| `event`    | `"redirect"`                                            |
| `listener` | (`url`: `string`, `request`: `ClientRequest`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.addListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:177

▸ **addListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                  |
| :--------- | :-------------------------------------------------------------------- |
| `event`    | `"unexpected-response"`                                               |
| `listener` | (`request`: `ClientRequest`, `response`: `IncomingMessage`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.addListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:178

▸ **addListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                           |
| :--------- | :----------------------------- |
| `event`    | `string` \| `symbol`           |
| `listener` | (...`args`: `any`[]) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.addListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:182

---

### close

▸ **close**(`code?`, `data?`): `void`

#### Parameters

| Name    | Type                 |
| :------ | :------------------- |
| `code?` | `number`             |
| `data?` | `string` \| `Buffer` |

#### Returns

`void`

#### Inherited from

WebSocketAlias.close

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:87

---

### emit

▸ **emit**(`eventName`, `...args`): `boolean`

Synchronously calls each of the listeners registered for the event named`eventName`, in the order they were registered, passing the supplied arguments
to each.

Returns `true` if the event had listeners, `false` otherwise.

```js
import { EventEmitter } from 'node:events';
const myEmitter = new EventEmitter();

// First listener
myEmitter.on('event', function firstListener() {
  console.log('Helloooo! first listener');
});
// Second listener
myEmitter.on('event', function secondListener(arg1, arg2) {
  console.log(`event with parameters ${arg1}, ${arg2} in second listener`);
});
// Third listener
myEmitter.on('event', function thirdListener(...args) {
  const parameters = args.join(', ');
  console.log(`event with parameters ${parameters} in third listener`);
});

console.log(myEmitter.listeners('event'));

myEmitter.emit('event', 1, 2, 3, 4, 5);

// Prints:
// [
//   [Function: firstListener],
//   [Function: secondListener],
//   [Function: thirdListener]
// ]
// Helloooo! first listener
// event with parameters 1, 2 in second listener
// event with parameters 1, 2, 3, 4, 5 in third listener
```

**`Since`**

v0.1.26

#### Parameters

| Name        | Type                 |
| :---------- | :------------------- |
| `eventName` | `string` \| `symbol` |
| `...args`   | `any`[]              |

#### Returns

`boolean`

#### Inherited from

WebSocketAlias.emit

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/events.d.ts:807

---

### eventNames

▸ **eventNames**(): (`string` \| `symbol`)[]

Returns an array listing the events for which the emitter has registered
listeners. The values in the array are strings or `Symbol`s.

```js
import { EventEmitter } from 'node:events';

const myEE = new EventEmitter();
myEE.on('foo', () => {});
myEE.on('bar', () => {});

const sym = Symbol('symbol');
myEE.on(sym, () => {});

console.log(myEE.eventNames());
// Prints: [ 'foo', 'bar', Symbol(symbol) ]
```

**`Since`**

v6.0.0

#### Returns

(`string` \| `symbol`)[]

#### Inherited from

WebSocketAlias.eventNames

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/events.d.ts:870

---

### getMaxListeners

▸ **getMaxListeners**(): `number`

Returns the current max listener value for the `EventEmitter` which is either
set by `emitter.setMaxListeners(n)` or defaults to defaultMaxListeners.

**`Since`**

v1.0.0

#### Returns

`number`

#### Inherited from

WebSocketAlias.getMaxListeners

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/events.d.ts:722

---

### listenerCount

▸ **listenerCount**(`eventName`, `listener?`): `number`

Returns the number of listeners listening for the event named `eventName`.
If `listener` is provided, it will return how many times the listener is found
in the list of the listeners of the event.

**`Since`**

v3.2.0

#### Parameters

| Name        | Type                                                                                                    | Description                              |
| :---------- | :------------------------------------------------------------------------------------------------------ | :--------------------------------------- |
| `eventName` | `string` \| `symbol`                                                                                    | The name of the event being listened for |
| `listener?` | [`Function`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function) | The event handler function               |

#### Returns

`number`

#### Inherited from

WebSocketAlias.listenerCount

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/events.d.ts:816

---

### listeners

▸ **listeners**(`eventName`): [`Function`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function)[]

Returns a copy of the array of listeners for the event named `eventName`.

```js
server.on('connection', stream => {
  console.log('someone connected!');
});
console.log(util.inspect(server.listeners('connection')));
// Prints: [ [Function] ]
```

**`Since`**

v0.1.26

#### Parameters

| Name        | Type                 |
| :---------- | :------------------- |
| `eventName` | `string` \| `symbol` |

#### Returns

[`Function`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function)[]

#### Inherited from

WebSocketAlias.listeners

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/events.d.ts:735

---

### off

▸ **off**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                  |
| :--------- | :-------------------------------------------------------------------- |
| `event`    | `"close"`                                                             |
| `listener` | (`this`: `WebSocket`, `code`: `number`, `reason`: `Buffer`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.off

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:158

▸ **off**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                                                                                        |
| :--------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| `event`    | `"error"`                                                                                                                                   |
| `listener` | (`this`: `WebSocket`, `error`: [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.off

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:159

▸ **off**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                          |
| :--------- | :------------------------------------------------------------ |
| `event`    | `"upgrade"`                                                   |
| `listener` | (`this`: `WebSocket`, `request`: `IncomingMessage`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.off

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:160

▸ **off**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                                                                 |
| :--------- | :------------------------------------------------------------------------------------------------------------------- |
| `event`    | `"message"`                                                                                                          |
| `listener` | (`this`: `WebSocket`, `data`: [`WebSocketData`](../modules/index.md#websocketdata), `isBinary`: `boolean`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.off

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:161

▸ **off**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                            |
| :--------- | :------------------------------ |
| `event`    | `"open"`                        |
| `listener` | (`this`: `WebSocket`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.off

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:162

▸ **off**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                              |
| :--------- | :------------------------------------------------ |
| `event`    | `"ping"` \| `"pong"`                              |
| `listener` | (`this`: `WebSocket`, `data`: `Buffer`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.off

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:163

▸ **off**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                         |
| :--------- | :--------------------------------------------------------------------------- |
| `event`    | `"redirect"`                                                                 |
| `listener` | (`this`: `WebSocket`, `url`: `string`, `request`: `ClientRequest`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.off

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:164

▸ **off**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                                       |
| :--------- | :----------------------------------------------------------------------------------------- |
| `event`    | `"unexpected-response"`                                                                    |
| `listener` | (`this`: `WebSocket`, `request`: `ClientRequest`, `response`: `IncomingMessage`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.off

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:165

▸ **off**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                |
| :--------- | :-------------------------------------------------- |
| `event`    | `string` \| `symbol`                                |
| `listener` | (`this`: `WebSocket`, ...`args`: `any`[]) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.off

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:169

---

### on

▸ **on**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                  |
| :--------- | :-------------------------------------------------------------------- |
| `event`    | `"close"`                                                             |
| `listener` | (`this`: `WebSocket`, `code`: `number`, `reason`: `Buffer`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.on

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:132

▸ **on**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                                                                                        |
| :--------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| `event`    | `"error"`                                                                                                                                   |
| `listener` | (`this`: `WebSocket`, `error`: [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.on

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:133

▸ **on**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                          |
| :--------- | :------------------------------------------------------------ |
| `event`    | `"upgrade"`                                                   |
| `listener` | (`this`: `WebSocket`, `request`: `IncomingMessage`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.on

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:134

▸ **on**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                                                                 |
| :--------- | :------------------------------------------------------------------------------------------------------------------- |
| `event`    | `"message"`                                                                                                          |
| `listener` | (`this`: `WebSocket`, `data`: [`WebSocketData`](../modules/index.md#websocketdata), `isBinary`: `boolean`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.on

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:135

▸ **on**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                            |
| :--------- | :------------------------------ |
| `event`    | `"open"`                        |
| `listener` | (`this`: `WebSocket`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.on

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:136

▸ **on**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                              |
| :--------- | :------------------------------------------------ |
| `event`    | `"ping"` \| `"pong"`                              |
| `listener` | (`this`: `WebSocket`, `data`: `Buffer`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.on

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:137

▸ **on**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                         |
| :--------- | :--------------------------------------------------------------------------- |
| `event`    | `"redirect"`                                                                 |
| `listener` | (`this`: `WebSocket`, `url`: `string`, `request`: `ClientRequest`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.on

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:138

▸ **on**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                                       |
| :--------- | :----------------------------------------------------------------------------------------- |
| `event`    | `"unexpected-response"`                                                                    |
| `listener` | (`this`: `WebSocket`, `request`: `ClientRequest`, `response`: `IncomingMessage`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.on

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:139

▸ **on**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                |
| :--------- | :-------------------------------------------------- |
| `event`    | `string` \| `symbol`                                |
| `listener` | (`this`: `WebSocket`, ...`args`: `any`[]) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.on

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:143

---

### once

▸ **once**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                  |
| :--------- | :-------------------------------------------------------------------- |
| `event`    | `"close"`                                                             |
| `listener` | (`this`: `WebSocket`, `code`: `number`, `reason`: `Buffer`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.once

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:145

▸ **once**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                                                                                        |
| :--------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| `event`    | `"error"`                                                                                                                                   |
| `listener` | (`this`: `WebSocket`, `error`: [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.once

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:146

▸ **once**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                          |
| :--------- | :------------------------------------------------------------ |
| `event`    | `"upgrade"`                                                   |
| `listener` | (`this`: `WebSocket`, `request`: `IncomingMessage`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.once

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:147

▸ **once**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                                                                 |
| :--------- | :------------------------------------------------------------------------------------------------------------------- |
| `event`    | `"message"`                                                                                                          |
| `listener` | (`this`: `WebSocket`, `data`: [`WebSocketData`](../modules/index.md#websocketdata), `isBinary`: `boolean`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.once

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:148

▸ **once**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                            |
| :--------- | :------------------------------ |
| `event`    | `"open"`                        |
| `listener` | (`this`: `WebSocket`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.once

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:149

▸ **once**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                              |
| :--------- | :------------------------------------------------ |
| `event`    | `"ping"` \| `"pong"`                              |
| `listener` | (`this`: `WebSocket`, `data`: `Buffer`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.once

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:150

▸ **once**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                         |
| :--------- | :--------------------------------------------------------------------------- |
| `event`    | `"redirect"`                                                                 |
| `listener` | (`this`: `WebSocket`, `url`: `string`, `request`: `ClientRequest`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.once

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:151

▸ **once**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                                       |
| :--------- | :----------------------------------------------------------------------------------------- |
| `event`    | `"unexpected-response"`                                                                    |
| `listener` | (`this`: `WebSocket`, `request`: `ClientRequest`, `response`: `IncomingMessage`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.once

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:152

▸ **once**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                |
| :--------- | :-------------------------------------------------- |
| `event`    | `string` \| `symbol`                                |
| `listener` | (`this`: `WebSocket`, ...`args`: `any`[]) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.once

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:156

---

### pause

▸ **pause**(): `void`

Pause the websocket causing it to stop emitting events. Some events can still be
emitted after this is called, until all buffered data is consumed. This method
is a noop if the ready state is `CONNECTING` or `CLOSED`.

#### Returns

`void`

#### Inherited from

WebSocketAlias.pause

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:109

---

### ping

▸ **ping**(`data?`, `mask?`, `cb?`): `void`

#### Parameters

| Name    | Type                                                                                                                 |
| :------ | :------------------------------------------------------------------------------------------------------------------- |
| `data?` | `any`                                                                                                                |
| `mask?` | `boolean`                                                                                                            |
| `cb?`   | (`err`: [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)) => `void` |

#### Returns

`void`

#### Inherited from

WebSocketAlias.ping

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:88

---

### pong

▸ **pong**(`data?`, `mask?`, `cb?`): `void`

#### Parameters

| Name    | Type                                                                                                                 |
| :------ | :------------------------------------------------------------------------------------------------------------------- |
| `data?` | `any`                                                                                                                |
| `mask?` | `boolean`                                                                                                            |
| `cb?`   | (`err`: [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)) => `void` |

#### Returns

`void`

#### Inherited from

WebSocketAlias.pong

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:89

---

### prependListener

▸ **prependListener**(`eventName`, `listener`): [`WebSocket`](../modules/index.md#websocket)

Adds the `listener` function to the _beginning_ of the listeners array for the
event named `eventName`. No checks are made to see if the `listener` has
already been added. Multiple calls passing the same combination of `eventName`and `listener` will result in the `listener` being added, and called, multiple
times.

```js
server.prependListener('connection', stream => {
  console.log('someone connected!');
});
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

**`Since`**

v6.0.0

#### Parameters

| Name        | Type                           | Description            |
| :---------- | :----------------------------- | :--------------------- |
| `eventName` | `string` \| `symbol`           | The name of the event. |
| `listener`  | (...`args`: `any`[]) => `void` | The callback function  |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.prependListener

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/events.d.ts:834

---

### prependOnceListener

▸ **prependOnceListener**(`eventName`, `listener`): [`WebSocket`](../modules/index.md#websocket)

Adds a **one-time**`listener` function for the event named `eventName` to the _beginning_ of the listeners array. The next time `eventName` is triggered, this
listener is removed, and then invoked.

```js
server.prependOnceListener('connection', stream => {
  console.log('Ah, we have our first user!');
});
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

**`Since`**

v6.0.0

#### Parameters

| Name        | Type                           | Description            |
| :---------- | :----------------------------- | :--------------------- |
| `eventName` | `string` \| `symbol`           | The name of the event. |
| `listener`  | (...`args`: `any`[]) => `void` | The callback function  |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.prependOnceListener

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/events.d.ts:850

---

### rawListeners

▸ **rawListeners**(`eventName`): [`Function`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function)[]

Returns a copy of the array of listeners for the event named `eventName`,
including any wrappers (such as those created by `.once()`).

```js
import { EventEmitter } from 'node:events';
const emitter = new EventEmitter();
emitter.once('log', () => console.log('log once'));

// Returns a new Array with a function `onceWrapper` which has a property
// `listener` which contains the original listener bound above
const listeners = emitter.rawListeners('log');
const logFnWrapper = listeners[0];

// Logs "log once" to the console and does not unbind the `once` event
logFnWrapper.listener();

// Logs "log once" to the console and removes the listener
logFnWrapper();

emitter.on('log', () => console.log('log persistently'));
// Will return a new Array with a single function bound by `.on()` above
const newListeners = emitter.rawListeners('log');

// Logs "log persistently" twice
newListeners[0]();
emitter.emit('log');
```

**`Since`**

v9.4.0

#### Parameters

| Name        | Type                 |
| :---------- | :------------------- |
| `eventName` | `string` \| `symbol` |

#### Returns

[`Function`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function)[]

#### Inherited from

WebSocketAlias.rawListeners

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/events.d.ts:766

---

### removeAllListeners

▸ **removeAllListeners**(`event?`): [`WebSocket`](../modules/index.md#websocket)

Removes all listeners, or those of the specified `eventName`.

It is bad practice to remove listeners added elsewhere in the code,
particularly when the `EventEmitter` instance was created by some other
component or module (e.g. sockets or file streams).

Returns a reference to the `EventEmitter`, so that calls can be chained.

**`Since`**

v0.1.26

#### Parameters

| Name     | Type                 |
| :------- | :------------------- |
| `event?` | `string` \| `symbol` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.removeAllListeners

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/events.d.ts:706

---

### removeEventListener

▸ **removeEventListener**<`K`\>(`type`, `listener`): `void`

#### Type parameters

| Name | Type                              |
| :--- | :-------------------------------- |
| `K`  | extends keyof `WebSocketEventMap` |

#### Parameters

| Name       | Type                                                                                                              |
| :--------- | :---------------------------------------------------------------------------------------------------------------- |
| `type`     | `K`                                                                                                               |
| `listener` | (`event`: `WebSocketEventMap`[`K`]) => `void` \| { `handleEvent`: (`event`: `WebSocketEventMap`[`K`]) => `void` } |

#### Returns

`void`

#### Inherited from

WebSocketAlias.removeEventListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:124

---

### removeListener

▸ **removeListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                             |
| :--------- | :----------------------------------------------- |
| `event`    | `"close"`                                        |
| `listener` | (`code`: `number`, `reason`: `Buffer`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.removeListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:184

▸ **removeListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                                                                   |
| :--------- | :--------------------------------------------------------------------------------------------------------------------- |
| `event`    | `"error"`                                                                                                              |
| `listener` | (`error`: [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.removeListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:185

▸ **removeListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                     |
| :--------- | :--------------------------------------- |
| `event`    | `"upgrade"`                              |
| `listener` | (`request`: `IncomingMessage`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.removeListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:186

▸ **removeListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                                            |
| :--------- | :---------------------------------------------------------------------------------------------- |
| `event`    | `"message"`                                                                                     |
| `listener` | (`data`: [`WebSocketData`](../modules/index.md#websocketdata), `isBinary`: `boolean`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.removeListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:187

▸ **removeListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type         |
| :--------- | :----------- |
| `event`    | `"open"`     |
| `listener` | () => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.removeListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:188

▸ **removeListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                         |
| :--------- | :--------------------------- |
| `event`    | `"ping"` \| `"pong"`         |
| `listener` | (`data`: `Buffer`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.removeListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:189

▸ **removeListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                    |
| :--------- | :------------------------------------------------------ |
| `event`    | `"redirect"`                                            |
| `listener` | (`url`: `string`, `request`: `ClientRequest`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.removeListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:190

▸ **removeListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                                                                  |
| :--------- | :-------------------------------------------------------------------- |
| `event`    | `"unexpected-response"`                                               |
| `listener` | (`request`: `ClientRequest`, `response`: `IncomingMessage`) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.removeListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:191

▸ **removeListener**(`event`, `listener`): [`WebSocket`](../modules/index.md#websocket)

#### Parameters

| Name       | Type                           |
| :--------- | :----------------------------- |
| `event`    | `string` \| `symbol`           |
| `listener` | (...`args`: `any`[]) => `void` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.removeListener

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:195

---

### resume

▸ **resume**(): `void`

Make a paused socket resume emitting events. This method is a noop if the ready
state is `CONNECTING` or `CLOSED`.

#### Returns

`void`

#### Inherited from

WebSocketAlias.resume

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:114

---

### send

▸ **send**(`data`, `cb?`): `void`

#### Parameters

| Name   | Type                                                                                                                  |
| :----- | :-------------------------------------------------------------------------------------------------------------------- |
| `data` | `BufferLike`                                                                                                          |
| `cb?`  | (`err?`: [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)) => `void` |

#### Returns

`void`

#### Inherited from

WebSocketAlias.send

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:91

▸ **send**(`data`, `options`, `cb?`): `void`

#### Parameters

| Name                | Type                                                                                                                  |
| :------------------ | :-------------------------------------------------------------------------------------------------------------------- |
| `data`              | `BufferLike`                                                                                                          |
| `options`           | `Object`                                                                                                              |
| `options.binary?`   | `boolean`                                                                                                             |
| `options.compress?` | `boolean`                                                                                                             |
| `options.fin?`      | `boolean`                                                                                                             |
| `options.mask?`     | `boolean`                                                                                                             |
| `cb?`               | (`err?`: [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)) => `void` |

#### Returns

`void`

#### Inherited from

WebSocketAlias.send

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:92

---

### setMaxListeners

▸ **setMaxListeners**(`n`): [`WebSocket`](../modules/index.md#websocket)

By default `EventEmitter`s will print a warning if more than `10` listeners are
added for a particular event. This is a useful default that helps finding
memory leaks. The `emitter.setMaxListeners()` method allows the limit to be
modified for this specific `EventEmitter` instance. The value can be set to`Infinity` (or `0`) to indicate an unlimited number of listeners.

Returns a reference to the `EventEmitter`, so that calls can be chained.

**`Since`**

v0.3.5

#### Parameters

| Name | Type     |
| :--- | :------- |
| `n`  | `number` |

#### Returns

[`WebSocket`](../modules/index.md#websocket)

#### Inherited from

WebSocketAlias.setMaxListeners

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/events.d.ts:716

---

### terminate

▸ **terminate**(): `void`

#### Returns

`void`

#### Inherited from

WebSocketAlias.terminate

#### Defined in

node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/index.d.ts:102
