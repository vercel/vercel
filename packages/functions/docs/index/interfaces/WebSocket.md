[**@vercel/functions**](../../README.md)

***

# Interface: WebSocket

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:438

## Extends

- `WebSocketAlias`

## Properties

### binaryType

> **binaryType**: `"nodebuffer"` \| `"arraybuffer"` \| `"fragments"`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:51

#### Inherited from

`WebSocketAlias.binaryType`

***

### bufferedAmount

> `readonly` **bufferedAmount**: `number`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:52

#### Inherited from

`WebSocketAlias.bufferedAmount`

***

### CLOSED

> `readonly` **CLOSED**: `3`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:72

The connection is closed.

#### Inherited from

`WebSocketAlias.CLOSED`

***

### CLOSING

> `readonly` **CLOSING**: `2`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:70

The connection is in the process of closing.

#### Inherited from

`WebSocketAlias.CLOSING`

***

### CONNECTING

> `readonly` **CONNECTING**: `0`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:66

The connection is not yet open.

#### Inherited from

`WebSocketAlias.CONNECTING`

***

### extensions

> `readonly` **extensions**: `string`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:53

#### Inherited from

`WebSocketAlias.extensions`

***

### isPaused

> `readonly` **isPaused**: `boolean`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:55

Indicates whether the websocket is paused

#### Inherited from

`WebSocketAlias.isPaused`

***

### onclose

> **onclose**: ((`event`) => `void`) \| `null`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:76

#### Inherited from

`WebSocketAlias.onclose`

***

### onerror

> **onerror**: ((`event`) => `void`) \| `null`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:75

#### Inherited from

`WebSocketAlias.onerror`

***

### onmessage

> **onmessage**: ((`event`) => `void`) \| `null`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:77

#### Inherited from

`WebSocketAlias.onmessage`

***

### onopen

> **onopen**: ((`event`) => `void`) \| `null`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:74

#### Inherited from

`WebSocketAlias.onopen`

***

### OPEN

> `readonly` **OPEN**: `1`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:68

The connection is open and ready to communicate.

#### Inherited from

`WebSocketAlias.OPEN`

***

### protocol

> `readonly` **protocol**: `string`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:56

#### Inherited from

`WebSocketAlias.protocol`

***

### readyState

> `readonly` **readyState**: `0` \| `1` \| `2` \| `3`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:58

The current state of the connection

#### Inherited from

`WebSocketAlias.readyState`

***

### url

> `readonly` **url**: `string`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:63

#### Inherited from

`WebSocketAlias.url`

## Methods

### \[captureRejectionSymbol\]()?

> `optional` **\[captureRejectionSymbol\]**(`error`, `event`, ...`args`): `void`

Defined in: node\_modules/.pnpm/@types+node@20.11.0/node\_modules/@types/node/events.d.ts:112

#### Parameters

##### error

[`Error`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Error)

##### event

`string`

##### args

...`any`[]

#### Returns

`void`

#### Inherited from

`WebSocketAlias.[captureRejectionSymbol]`

***

### addEventListener()

> **addEventListener**\<`K`\>(`type`, `listener`, `options?`): `void`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:117

#### Type Parameters

##### K

`K` *extends* keyof `WebSocketEventMap`

#### Parameters

##### type

`K`

##### listener

((`event`) => `void`) \| \{ `handleEvent`: `void`; \}

##### options?

`EventListenerOptions`

#### Returns

`void`

#### Inherited from

`WebSocketAlias.addEventListener`

***

### addListener()

#### Call Signature

> **addListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:171

Alias for `emitter.on(eventName, listener)`.

##### Parameters

###### event

`"close"`

###### listener

(`code`, `reason`) => `void`

##### Returns

`this`

##### Since

v0.1.26

##### Inherited from

`WebSocketAlias.addListener`

#### Call Signature

> **addListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:172

##### Parameters

###### event

`"error"`

###### listener

(`error`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.addListener`

#### Call Signature

> **addListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:173

##### Parameters

###### event

`"upgrade"`

###### listener

(`request`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.addListener`

#### Call Signature

> **addListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:174

##### Parameters

###### event

`"message"`

###### listener

(`data`, `isBinary`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.addListener`

#### Call Signature

> **addListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:175

##### Parameters

###### event

`"open"`

###### listener

() => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.addListener`

#### Call Signature

> **addListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:176

##### Parameters

###### event

`"ping"` \| `"pong"`

###### listener

(`data`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.addListener`

#### Call Signature

> **addListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:177

##### Parameters

###### event

`"redirect"`

###### listener

(`url`, `request`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.addListener`

#### Call Signature

> **addListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:178

##### Parameters

###### event

`"unexpected-response"`

###### listener

(`request`, `response`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.addListener`

#### Call Signature

> **addListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:182

##### Parameters

###### event

`string` \| `symbol`

###### listener

(...`args`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.addListener`

***

### close()

> **close**(`code?`, `data?`): `void`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:87

#### Parameters

##### code?

`number`

##### data?

`string` \| `Buffer`

#### Returns

`void`

#### Inherited from

`WebSocketAlias.close`

***

### emit()

> **emit**(`eventName`, ...`args`): `boolean`

Defined in: node\_modules/.pnpm/@types+node@20.11.0/node\_modules/@types/node/events.d.ts:807

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

#### Parameters

##### eventName

`string` \| `symbol`

##### args

...`any`[]

#### Returns

`boolean`

#### Since

v0.1.26

#### Inherited from

`WebSocketAlias.emit`

***

### eventNames()

> **eventNames**(): (`string` \| `symbol`)[]

Defined in: node\_modules/.pnpm/@types+node@20.11.0/node\_modules/@types/node/events.d.ts:870

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

#### Returns

(`string` \| `symbol`)[]

#### Since

v6.0.0

#### Inherited from

`WebSocketAlias.eventNames`

***

### getMaxListeners()

> **getMaxListeners**(): `number`

Defined in: node\_modules/.pnpm/@types+node@20.11.0/node\_modules/@types/node/events.d.ts:722

Returns the current max listener value for the `EventEmitter` which is either
set by `emitter.setMaxListeners(n)` or defaults to defaultMaxListeners.

#### Returns

`number`

#### Since

v1.0.0

#### Inherited from

`WebSocketAlias.getMaxListeners`

***

### listenerCount()

> **listenerCount**(`eventName`, `listener?`): `number`

Defined in: node\_modules/.pnpm/@types+node@20.11.0/node\_modules/@types/node/events.d.ts:816

Returns the number of listeners listening for the event named `eventName`.
If `listener` is provided, it will return how many times the listener is found
in the list of the listeners of the event.

#### Parameters

##### eventName

`string` \| `symbol`

The name of the event being listened for

##### listener?

[`Function`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Function)

The event handler function

#### Returns

`number`

#### Since

v3.2.0

#### Inherited from

`WebSocketAlias.listenerCount`

***

### listeners()

> **listeners**(`eventName`): [`Function`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Function)[]

Defined in: node\_modules/.pnpm/@types+node@20.11.0/node\_modules/@types/node/events.d.ts:735

Returns a copy of the array of listeners for the event named `eventName`.

```js
server.on('connection', (stream) => {
  console.log('someone connected!');
});
console.log(util.inspect(server.listeners('connection')));
// Prints: [ [Function] ]
```

#### Parameters

##### eventName

`string` \| `symbol`

#### Returns

[`Function`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Function)[]

#### Since

v0.1.26

#### Inherited from

`WebSocketAlias.listeners`

***

### off()

#### Call Signature

> **off**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:158

Alias for `emitter.removeListener()`.

##### Parameters

###### event

`"close"`

###### listener

(`this`, `code`, `reason`) => `void`

##### Returns

`this`

##### Since

v10.0.0

##### Inherited from

`WebSocketAlias.off`

#### Call Signature

> **off**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:159

##### Parameters

###### event

`"error"`

###### listener

(`this`, `error`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.off`

#### Call Signature

> **off**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:160

##### Parameters

###### event

`"upgrade"`

###### listener

(`this`, `request`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.off`

#### Call Signature

> **off**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:161

##### Parameters

###### event

`"message"`

###### listener

(`this`, `data`, `isBinary`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.off`

#### Call Signature

> **off**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:162

##### Parameters

###### event

`"open"`

###### listener

(`this`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.off`

#### Call Signature

> **off**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:163

##### Parameters

###### event

`"ping"` \| `"pong"`

###### listener

(`this`, `data`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.off`

#### Call Signature

> **off**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:164

##### Parameters

###### event

`"redirect"`

###### listener

(`this`, `url`, `request`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.off`

#### Call Signature

> **off**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:165

##### Parameters

###### event

`"unexpected-response"`

###### listener

(`this`, `request`, `response`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.off`

#### Call Signature

> **off**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:169

##### Parameters

###### event

`string` \| `symbol`

###### listener

(`this`, ...`args`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.off`

***

### on()

#### Call Signature

> **on**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:132

Adds the `listener` function to the end of the listeners array for the
event named `eventName`. No checks are made to see if the `listener` has
already been added. Multiple calls passing the same combination of `eventName`and `listener` will result in the `listener` being added, and called, multiple
times.

```js
server.on('connection', (stream) => {
  console.log('someone connected!');
});
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

By default, event listeners are invoked in the order they are added. The`emitter.prependListener()` method can be used as an alternative to add the
event listener to the beginning of the listeners array.

```js
import { EventEmitter } from 'node:events';
const myEE = new EventEmitter();
myEE.on('foo', () => console.log('a'));
myEE.prependListener('foo', () => console.log('b'));
myEE.emit('foo');
// Prints:
//   b
//   a
```

##### Parameters

###### event

`"close"`

###### listener

(`this`, `code`, `reason`) => `void`

The callback function

##### Returns

`this`

##### Since

v0.1.101

##### Inherited from

`WebSocketAlias.on`

#### Call Signature

> **on**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:133

##### Parameters

###### event

`"error"`

###### listener

(`this`, `error`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.on`

#### Call Signature

> **on**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:134

##### Parameters

###### event

`"upgrade"`

###### listener

(`this`, `request`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.on`

#### Call Signature

> **on**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:135

##### Parameters

###### event

`"message"`

###### listener

(`this`, `data`, `isBinary`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.on`

#### Call Signature

> **on**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:136

##### Parameters

###### event

`"open"`

###### listener

(`this`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.on`

#### Call Signature

> **on**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:137

##### Parameters

###### event

`"ping"` \| `"pong"`

###### listener

(`this`, `data`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.on`

#### Call Signature

> **on**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:138

##### Parameters

###### event

`"redirect"`

###### listener

(`this`, `url`, `request`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.on`

#### Call Signature

> **on**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:139

##### Parameters

###### event

`"unexpected-response"`

###### listener

(`this`, `request`, `response`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.on`

#### Call Signature

> **on**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:143

##### Parameters

###### event

`string` \| `symbol`

###### listener

(`this`, ...`args`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.on`

***

### once()

#### Call Signature

> **once**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:145

Adds a **one-time**`listener` function for the event named `eventName`. The
next time `eventName` is triggered, this listener is removed and then invoked.

```js
server.once('connection', (stream) => {
  console.log('Ah, we have our first user!');
});
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

By default, event listeners are invoked in the order they are added. The`emitter.prependOnceListener()` method can be used as an alternative to add the
event listener to the beginning of the listeners array.

```js
import { EventEmitter } from 'node:events';
const myEE = new EventEmitter();
myEE.once('foo', () => console.log('a'));
myEE.prependOnceListener('foo', () => console.log('b'));
myEE.emit('foo');
// Prints:
//   b
//   a
```

##### Parameters

###### event

`"close"`

###### listener

(`this`, `code`, `reason`) => `void`

The callback function

##### Returns

`this`

##### Since

v0.3.0

##### Inherited from

`WebSocketAlias.once`

#### Call Signature

> **once**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:146

##### Parameters

###### event

`"error"`

###### listener

(`this`, `error`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.once`

#### Call Signature

> **once**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:147

##### Parameters

###### event

`"upgrade"`

###### listener

(`this`, `request`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.once`

#### Call Signature

> **once**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:148

##### Parameters

###### event

`"message"`

###### listener

(`this`, `data`, `isBinary`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.once`

#### Call Signature

> **once**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:149

##### Parameters

###### event

`"open"`

###### listener

(`this`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.once`

#### Call Signature

> **once**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:150

##### Parameters

###### event

`"ping"` \| `"pong"`

###### listener

(`this`, `data`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.once`

#### Call Signature

> **once**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:151

##### Parameters

###### event

`"redirect"`

###### listener

(`this`, `url`, `request`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.once`

#### Call Signature

> **once**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:152

##### Parameters

###### event

`"unexpected-response"`

###### listener

(`this`, `request`, `response`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.once`

#### Call Signature

> **once**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:156

##### Parameters

###### event

`string` \| `symbol`

###### listener

(`this`, ...`args`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.once`

***

### pause()

> **pause**(): `void`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:109

Pause the websocket causing it to stop emitting events. Some events can still be
emitted after this is called, until all buffered data is consumed. This method
is a noop if the ready state is `CONNECTING` or `CLOSED`.

#### Returns

`void`

#### Inherited from

`WebSocketAlias.pause`

***

### ping()

> **ping**(`data?`, `mask?`, `cb?`): `void`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:88

#### Parameters

##### data?

`any`

##### mask?

`boolean`

##### cb?

(`err`) => `void`

#### Returns

`void`

#### Inherited from

`WebSocketAlias.ping`

***

### pong()

> **pong**(`data?`, `mask?`, `cb?`): `void`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:89

#### Parameters

##### data?

`any`

##### mask?

`boolean`

##### cb?

(`err`) => `void`

#### Returns

`void`

#### Inherited from

`WebSocketAlias.pong`

***

### prependListener()

> **prependListener**(`eventName`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+node@20.11.0/node\_modules/@types/node/events.d.ts:834

Adds the `listener` function to the _beginning_ of the listeners array for the
event named `eventName`. No checks are made to see if the `listener` has
already been added. Multiple calls passing the same combination of `eventName`and `listener` will result in the `listener` being added, and called, multiple
times.

```js
server.prependListener('connection', (stream) => {
  console.log('someone connected!');
});
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

#### Parameters

##### eventName

`string` \| `symbol`

The name of the event.

##### listener

(...`args`) => `void`

The callback function

#### Returns

`this`

#### Since

v6.0.0

#### Inherited from

`WebSocketAlias.prependListener`

***

### prependOnceListener()

> **prependOnceListener**(`eventName`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+node@20.11.0/node\_modules/@types/node/events.d.ts:850

Adds a **one-time**`listener` function for the event named `eventName` to the _beginning_ of the listeners array. The next time `eventName` is triggered, this
listener is removed, and then invoked.

```js
server.prependOnceListener('connection', (stream) => {
  console.log('Ah, we have our first user!');
});
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

#### Parameters

##### eventName

`string` \| `symbol`

The name of the event.

##### listener

(...`args`) => `void`

The callback function

#### Returns

`this`

#### Since

v6.0.0

#### Inherited from

`WebSocketAlias.prependOnceListener`

***

### rawListeners()

> **rawListeners**(`eventName`): [`Function`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Function)[]

Defined in: node\_modules/.pnpm/@types+node@20.11.0/node\_modules/@types/node/events.d.ts:766

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

#### Parameters

##### eventName

`string` \| `symbol`

#### Returns

[`Function`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Function)[]

#### Since

v9.4.0

#### Inherited from

`WebSocketAlias.rawListeners`

***

### removeAllListeners()

> **removeAllListeners**(`event?`): `this`

Defined in: node\_modules/.pnpm/@types+node@20.11.0/node\_modules/@types/node/events.d.ts:706

Removes all listeners, or those of the specified `eventName`.

It is bad practice to remove listeners added elsewhere in the code,
particularly when the `EventEmitter` instance was created by some other
component or module (e.g. sockets or file streams).

Returns a reference to the `EventEmitter`, so that calls can be chained.

#### Parameters

##### event?

`string` \| `symbol`

#### Returns

`this`

#### Since

v0.1.26

#### Inherited from

`WebSocketAlias.removeAllListeners`

***

### removeEventListener()

> **removeEventListener**\<`K`\>(`type`, `listener`): `void`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:124

#### Type Parameters

##### K

`K` *extends* keyof `WebSocketEventMap`

#### Parameters

##### type

`K`

##### listener

((`event`) => `void`) \| \{ `handleEvent`: `void`; \}

#### Returns

`void`

#### Inherited from

`WebSocketAlias.removeEventListener`

***

### removeListener()

#### Call Signature

> **removeListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:184

Removes the specified `listener` from the listener array for the event named`eventName`.

```js
const callback = (stream) => {
  console.log('someone connected!');
};
server.on('connection', callback);
// ...
server.removeListener('connection', callback);
```

`removeListener()` will remove, at most, one instance of a listener from the
listener array. If any single listener has been added multiple times to the
listener array for the specified `eventName`, then `removeListener()` must be
called multiple times to remove each instance.

Once an event is emitted, all listeners attached to it at the
time of emitting are called in order. This implies that any`removeListener()` or `removeAllListeners()` calls _after_ emitting and _before_ the last listener finishes execution
will not remove them from`emit()` in progress. Subsequent events behave as expected.

```js
import { EventEmitter } from 'node:events';
class MyEmitter extends EventEmitter {}
const myEmitter = new MyEmitter();

const callbackA = () => {
  console.log('A');
  myEmitter.removeListener('event', callbackB);
};

const callbackB = () => {
  console.log('B');
};

myEmitter.on('event', callbackA);

myEmitter.on('event', callbackB);

// callbackA removes listener callbackB but it will still be called.
// Internal listener array at time of emit [callbackA, callbackB]
myEmitter.emit('event');
// Prints:
//   A
//   B

// callbackB is now removed.
// Internal listener array [callbackA]
myEmitter.emit('event');
// Prints:
//   A
```

Because listeners are managed using an internal array, calling this will
change the position indices of any listener registered _after_ the listener
being removed. This will not impact the order in which listeners are called,
but it means that any copies of the listener array as returned by
the `emitter.listeners()` method will need to be recreated.

When a single function has been added as a handler multiple times for a single
event (as in the example below), `removeListener()` will remove the most
recently added instance. In the example the `once('ping')`listener is removed:

```js
import { EventEmitter } from 'node:events';
const ee = new EventEmitter();

function pong() {
  console.log('pong');
}

ee.on('ping', pong);
ee.once('ping', pong);
ee.removeListener('ping', pong);

ee.emit('ping');
ee.emit('ping');
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

##### Parameters

###### event

`"close"`

###### listener

(`code`, `reason`) => `void`

##### Returns

`this`

##### Since

v0.1.26

##### Inherited from

`WebSocketAlias.removeListener`

#### Call Signature

> **removeListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:185

##### Parameters

###### event

`"error"`

###### listener

(`error`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.removeListener`

#### Call Signature

> **removeListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:186

##### Parameters

###### event

`"upgrade"`

###### listener

(`request`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.removeListener`

#### Call Signature

> **removeListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:187

##### Parameters

###### event

`"message"`

###### listener

(`data`, `isBinary`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.removeListener`

#### Call Signature

> **removeListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:188

##### Parameters

###### event

`"open"`

###### listener

() => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.removeListener`

#### Call Signature

> **removeListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:189

##### Parameters

###### event

`"ping"` \| `"pong"`

###### listener

(`data`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.removeListener`

#### Call Signature

> **removeListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:190

##### Parameters

###### event

`"redirect"`

###### listener

(`url`, `request`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.removeListener`

#### Call Signature

> **removeListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:191

##### Parameters

###### event

`"unexpected-response"`

###### listener

(`request`, `response`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.removeListener`

#### Call Signature

> **removeListener**(`event`, `listener`): `this`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:195

##### Parameters

###### event

`string` \| `symbol`

###### listener

(...`args`) => `void`

##### Returns

`this`

##### Inherited from

`WebSocketAlias.removeListener`

***

### resume()

> **resume**(): `void`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:114

Make a paused socket resume emitting events. This method is a noop if the ready
state is `CONNECTING` or `CLOSED`.

#### Returns

`void`

#### Inherited from

`WebSocketAlias.resume`

***

### send()

#### Call Signature

> **send**(`data`, `cb?`): `void`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:91

##### Parameters

###### data

`BufferLike`

###### cb?

(`err?`) => `void`

##### Returns

`void`

##### Inherited from

`WebSocketAlias.send`

#### Call Signature

> **send**(`data`, `options`, `cb?`): `void`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:92

##### Parameters

###### data

`BufferLike`

###### options

###### binary?

`boolean`

###### compress?

`boolean`

###### fin?

`boolean`

###### mask?

`boolean`

###### cb?

(`err?`) => `void`

##### Returns

`void`

##### Inherited from

`WebSocketAlias.send`

***

### setMaxListeners()

> **setMaxListeners**(`n`): `this`

Defined in: node\_modules/.pnpm/@types+node@20.11.0/node\_modules/@types/node/events.d.ts:716

By default `EventEmitter`s will print a warning if more than `10` listeners are
added for a particular event. This is a useful default that helps finding
memory leaks. The `emitter.setMaxListeners()` method allows the limit to be
modified for this specific `EventEmitter` instance. The value can be set to`Infinity` (or `0`) to indicate an unlimited number of listeners.

Returns a reference to the `EventEmitter`, so that calls can be chained.

#### Parameters

##### n

`number`

#### Returns

`this`

#### Since

v0.3.5

#### Inherited from

`WebSocketAlias.setMaxListeners`

***

### terminate()

> **terminate**(): `void`

Defined in: node\_modules/.pnpm/@types+ws@8.18.1/node\_modules/@types/ws/index.d.ts:102

#### Returns

`void`

#### Inherited from

`WebSocketAlias.terminate`
