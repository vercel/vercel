# parse-git-config [![NPM version](https://img.shields.io/npm/v/parse-git-config.svg?style=flat)](https://www.npmjs.com/package/parse-git-config) [![NPM monthly downloads](https://img.shields.io/npm/dm/parse-git-config.svg?style=flat)](https://npmjs.org/package/parse-git-config) [![NPM total downloads](https://img.shields.io/npm/dt/parse-git-config.svg?style=flat)](https://npmjs.org/package/parse-git-config) [![Linux Build Status](https://img.shields.io/travis/jonschlinkert/parse-git-config.svg?style=flat&label=Travis)](https://travis-ci.org/jonschlinkert/parse-git-config)

> Parse `.git/config` into a JavaScript object. sync or async.

Please consider following this project's author, [Jon Schlinkert](https://github.com/jonschlinkert), and consider starring the project to show your :heart: and support.

## Install

Install with [npm](https://www.npmjs.com/):

```sh
$ npm install --save parse-git-config
```

## Usage

```js
const parse = require('parse-git-config');

// sync
console.log(parse.sync());

// using async/await
(async () => console.log(await parse()))();
```

## Options

### cwd

The starting directory to search from.

**Type**: `string`

**Default**: `process.cwd()` (current working directory)

### path

Either the absolute path to .git `config`, or the path relative to the current working directory.

**Type**: `string`

**Default**: `.git/config`

### Examples config object

Parsed config object will look something like:

```js
{ core:
   { repositoryformatversion: '0',
     filemode: true,
     bare: false,
     logallrefupdates: true,
     ignorecase: true,
     precomposeunicode: true },
  'remote "origin"':
   { url: 'https://github.com/jonschlinkert/parse-git-config.git',
     fetch: '+refs/heads/*:refs/remotes/origin/*' },
  'branch "master"': { remote: 'origin', merge: 'refs/heads/master', ... } }
```

## API

### [parse](index.js#L42)

Asynchronously parse a `.git/config` file. If only the callback is passed, the `.git/config` file relative to `process.cwd()` is used.

**Params**

* `options` **{Object|String|Function}**: Options with `cwd` or `path`, the cwd to use, or the callback function.
* `callback` **{Function}**: callback function if the first argument is options or cwd.
* `returns` **{Object}**

**Example**

```js
parse((err, config) => {
  if (err) throw err;
  // do stuff with config
});

// or, using async/await
(async () => {
  console.log(await parse());
  console.log(await parse({ cwd: 'foo' }));
  console.log(await parse({ cwd: 'foo', path: 'some/.git/config' }));
})();
```

### [.sync](index.js#L88)

Synchronously parse a `.git/config` file. If no arguments are passed, the `.git/config` file relative to `process.cwd()` is used.

**Params**

* `options` **{Object|String}**: Options with `cwd` or `path`, or the cwd to use.
* `returns` **{Object}**

**Example**

```js
console.log(parse.sync());
console.log(parse.sync({ cwd: 'foo' }));
console.log(parse.sync({ cwd: 'foo', path: 'some/.git/config' }));
```

### [.expandKeys](index.js#L134)

Returns an object with only the properties that had ini-style keys converted to objects.

**Params**

* `config` **{Object}**: The parsed git config object.
* `returns` **{Object}**

**Example**

```js
const config = parse.sync({ path: '/path/to/.gitconfig' });
const obj = parse.expandKeys(config);
```

### .expandKeys examples

Converts ini-style keys into objects:

**Example 1**

```js
const parse = require('parse-git-config');
const config = { 
  'foo "bar"': { doStuff: true },
  'foo "baz"': { doStuff: true } 
};

console.log(parse.expandKeys(config));
```

Results in:

```js
{ 
  foo: { 
    bar: { doStuff: true }, 
    baz: { doStuff: true } 
  } 
}
```

**Example 2**

```js
const parse = require('parse-git-config');
const config = {
  'remote "origin"': { 
    url: 'https://github.com/jonschlinkert/normalize-pkg.git',
    fetch: '+refs/heads/*:refs/remotes/origin/*' 
  },
  'branch "master"': { 
    remote: 'origin', 
    merge: 'refs/heads/master' 
  },
  'branch "dev"': { 
    remote: 'origin', 
    merge: 'refs/heads/dev', 
    rebase: true 
  }
};

console.log(parse.expandKeys(config));
```

Results in:

```js
{
  remote: {
    origin: {
      url: 'https://github.com/jonschlinkert/normalize-pkg.git',
      fetch: '+refs/heads/*:refs/remotes/origin/*'
    }
  },
  branch: {
    master: {
      remote: 'origin',
      merge: 'refs/heads/master'
    },
    dev: {
      remote: 'origin',
      merge: 'refs/heads/dev',
      rebase: true
    }
  }
}
```

## About

<details>
<summary><strong>Contributing</strong></summary>

Pull requests and stars are always welcome. For bugs and feature requests, [please create an issue](../../issues/new).

</details>

<details>
<summary><strong>Running Tests</strong></summary>

Running and reviewing unit tests is a great way to get familiarized with a library and its API. You can install dependencies and run tests with the following command:

```sh
$ npm install && npm test
```

</details>

<details>
<summary><strong>Building docs</strong></summary>

_(This project's readme.md is generated by [verb](https://github.com/verbose/verb-generate-readme), please don't edit the readme directly. Any changes to the readme must be made in the [.verb.md](.verb.md) readme template.)_

To generate the readme, run the following command:

```sh
$ npm install -g verbose/verb#dev verb-generate-readme && verb
```

</details>

### Related projects

You might also be interested in these projects:

* [git-user-name](https://www.npmjs.com/package/git-user-name): Get a user's name from git config at the project or global scope, depending on… [more](https://github.com/jonschlinkert/git-user-name) | [homepage](https://github.com/jonschlinkert/git-user-name "Get a user's name from git config at the project or global scope, depending on what git uses in the current context.")
* [git-username](https://www.npmjs.com/package/git-username): Get the username (or 'owner' name) from a git/GitHub remote origin URL. | [homepage](https://github.com/jonschlinkert/git-username "Get the username (or 'owner' name) from a git/GitHub remote origin URL.")
* [parse-author](https://www.npmjs.com/package/parse-author): Parse an author, contributor, maintainer or other 'person' string into an object with name, email… [more](https://github.com/jonschlinkert/parse-author) | [homepage](https://github.com/jonschlinkert/parse-author "Parse an author, contributor, maintainer or other 'person' string into an object with name, email and url properties following npm conventions.")
* [parse-authors](https://www.npmjs.com/package/parse-authors): Parse a string into an array of objects with `name`, `email` and `url` properties following… [more](https://github.com/jonschlinkert/parse-authors) | [homepage](https://github.com/jonschlinkert/parse-authors "Parse a string into an array of objects with `name`, `email` and `url` properties following npm conventions. Useful for the `authors` property in package.json or for parsing an AUTHORS file into an array of authors objects.")
* [parse-github-url](https://www.npmjs.com/package/parse-github-url): Parse a github URL into an object. | [homepage](https://github.com/jonschlinkert/parse-github-url "Parse a github URL into an object.")
* [parse-gitignore](https://www.npmjs.com/package/parse-gitignore): Parse a .gitignore or .npmignore file into an array of patterns. | [homepage](https://github.com/jonschlinkert/parse-gitignore "Parse a .gitignore or .npmignore file into an array of patterns.")

### Contributors

| **Commits** | **Contributor** |  
| --- | --- |  
| 66 | [jonschlinkert](https://github.com/jonschlinkert) |  
| 4  | [doowb](https://github.com/doowb) |  
| 1  | [daviwil](https://github.com/daviwil) |  
| 1  | [LexSwed](https://github.com/LexSwed) |  
| 1  | [sam3d](https://github.com/sam3d) |  
| 1  | [suarasaur](https://github.com/suarasaur) |  

### Author

**Jon Schlinkert**

* [GitHub Profile](https://github.com/jonschlinkert)
* [Twitter Profile](https://twitter.com/jonschlinkert)
* [LinkedIn Profile](https://linkedin.com/in/jonschlinkert)

### License

Copyright © 2018, [Jon Schlinkert](https://github.com/jonschlinkert).
Released under the [MIT License](LICENSE).

***

_This file was generated by [verb-generate-readme](https://github.com/verbose/verb-generate-readme), v0.8.0, on November 20, 2018._