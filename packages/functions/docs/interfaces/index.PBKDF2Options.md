# Interface: PBKDF2Options

[index](../modules/index.md).PBKDF2Options

Options for PBKDF2 key derivation

## Table of contents

### Properties

- [algorithm](index.PBKDF2Options.md#algorithm)
- [iterations](index.PBKDF2Options.md#iterations)
- [keyLength](index.PBKDF2Options.md#keylength)
- [salt](index.PBKDF2Options.md#salt)

## Properties

### algorithm

• **algorithm**: ``"SHA-1"`` \| ``"SHA-256"`` \| ``"SHA-384"`` \| ``"SHA-512"``

The algorithm to use for key derivation

#### Defined in

[packages/functions/src/crypto.ts:23](https://github.com/ElProConLag/vercel/blob/main/packages/functions/src/crypto.ts#L23)

___

### iterations

• **iterations**: `number`

The number of iterations

#### Defined in

[packages/functions/src/crypto.ts:25](https://github.com/ElProConLag/vercel/blob/main/packages/functions/src/crypto.ts#L25)

___

### keyLength

• **keyLength**: `number`

The length of the derived key in bytes

#### Defined in

[packages/functions/src/crypto.ts:27](https://github.com/ElProConLag/vercel/blob/main/packages/functions/src/crypto.ts#L27)

___

### salt

• **salt**: [`ArrayBuffer`]( https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer ) \| [`Uint8Array`]( https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array )

The salt as ArrayBuffer or Uint8Array

#### Defined in

[packages/functions/src/crypto.ts:29](https://github.com/ElProConLag/vercel/blob/main/packages/functions/src/crypto.ts#L29)
