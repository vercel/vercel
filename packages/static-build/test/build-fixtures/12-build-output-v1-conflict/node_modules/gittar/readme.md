# gittar [![TravisCI Status](https://travis-ci.org/lukeed/gittar.svg?branch=master)](https://travis-ci.org/lukeed/gittar) [![AppVeyor Status](https://ci.appveyor.com/api/projects/status/4xj1vr9pyieaoibf?svg=true)](https://ci.appveyor.com/project/lukeed/gittar)

> :guitar: Download and/or Extract git repositories (GitHub, GitLab, BitBucket). Cross-platform and Offline-first!

Gittar is a Promise-based API that downloads `*.tar.gz` files from GitHub, GitLab, and BitBucket.

All archives are saved to the `$HOME/.gittar` directory with the following structure:

```sh
{HOSTNAME}/{USER}/{REPO}/{BRANCH-TAG}.tar.gz
#=> github/lukeed/mri/v1.1.0.tar.gz
#=> gitlab/Rich-Harris/buble/v0.15.2.tar.gz
#=> github/vuejs-templates/pwa/master.tar.gz
```

By default, new `gittar.fetch` requests will check the local filesystem for a matching tarball _before_ intiating a new remote download!

> **Important:** Please see [`gittar.fetch`](#gittarfetchrepo-options) for exceptions & behaviors!


## Install

```
$ npm install --save gittar
```


## Usage

```js
const gittar = require('gittar');

gittar.fetch('lukeed/gittar').then(console.log);
//=> ~/.gittar/github/lukeed/gittar/master.tar.gz

gittar.fetch('lukeed/tinydate#v1.0.0').then(console.log);
//=> ~/.gittar/github/lukeed/tinydate/v1.0.0.tar.gz

gittar.fetch('https://github.com/lukeed/mri').then(console.log);
//=> ~/.gittar/github/lukeed/mri/master.tar.gz

gittar.fetch('gitlab:Rich-Harris/buble#v0.15.2').then(console.log);
//=> ~/.gittar/gitlab/Rich-Harris/buble/v0.15.2.tar.gz

gittar.fetch('Rich-Harris/buble', { host:'gitlab' }).then(console.log);
//=> ~/.gittar/gitlab/Rich-Harris/buble/master.tar.gz

const src = '...local file or repo pattern...';
const dest = '/path/to/foobar';

gittar.extract(src, dest, {
  filter(path, entry) {
    if (path.includes('package.json')) {
      let pkg = '';
      entry.on('data', x => pkg += x).on('end', _ => {
        const devDeps = JSON.parse(pkg).devDependencies || {};
        console.log('~> new devDependencies:', Object.keys(devDeps));
      });
    }

    if (path.includes('.babelrc')) {
      return false; // ignore this file!
    }

    return true; // keep all other files
  }
});
```


## API

### gittar.fetch(repo, options)

Type: `Promise`<br>
Returns: `String`

***Behavior***

Parses the `repo` name, then looks for matching tarball on filesystem. Otherwise, a HTTPS request is dispatched and then, if successful, the archive is saved to `~/.gittar` at the appropriate path.

***Exceptions***

- If Gittar detects that your machine is not connected to the internet, or if [`useCache`](#optionsusecache) is `true`, then it will _only_ attempt a local fetch.
- If `repo` is (or is assumed to be) a `master` branch, or if [`force`](#optionsforce) is `true`, then the archive will be downloaded over HTTPS _before_ checking local cache.

#### repo
Type: `String`

The name, link, or pattern for a git repository.

Optionally provide a tag or branch name, otherwise `master` is assumed.

```js
parse('user/repo');
//=> ~/.gittar/github/user/repo/master.tar.gz
//=> https://github.com/user/repo/archive/master.tar.gz

parse('user/repo#v1.0.0');
//=> ~/.gittar/github/user/repo/v1.0.0.tar.gz
//=> https://github.com/user/repo/archive/v1.0.0.tar.gz

parse('user/repo#production');
//=> ~/.gittar/github/user/repo/production.tar.gz
//=> https://github.com/user/repo/archive/production.tar.gz

parse('bitbucket:user/repo');
//=> ~/.gittar/bitbucket/user/repo/master.tar.gz
//=> https://bitbucket.org/user/repo/get/master.tar.gz

parse('https://gitlab.com/user/repo');
//=> ~/.gittar/gitlab/user/repo/master.tar.gz
//=> https://gitlab.com/user/repo/repository/archive.tar.gz?ref=master
```

> **Note:** The `parse` function does not exist -- it's only demonstrating the _parsed_ values of the varying patterns.

#### options.host
Type: `String`<br>
Default: `github`

The hostname for the repository.

Specifying a "hint" in the [`repo`](#repo) will take precedence over this value.

```js
fetch('gitlab:user/repo', { host:'bitbucket' });
//=> ~/.gittar/gitlab/user/repo/master.tar.gz
//=> https://gitlab.com/user/repo/repository/archive.tar.gz?ref=master
```

#### options.force
Type: `Boolean`<br>
Default: `false`

Force a HTTPS download. If there is an error with the network request, a local/cache lookup will follow.

> **Note:** A network request is also forced if the `repo` is (or is assumed to be) a `master` branch!

#### options.useCache
Type: `Boolean`<br>
Default: `false`

Only attempt to use an existing, cached file. No network requests will be dispatched.

> **Note:** Gittar enacts this option if it detects that there is no internet connectivity.


### gittar.extract(file, target, options)

#### file
Type: `String`

A filepath to extract. Also accepts a [`repo`](#repo) pattern!

> **Important:** A `repo` pattern will be parsed (internally) as a filepath. No network requests will be dispatched.

#### target
Type: `String`<br>
Default: `process.cwd()`

The target directory to place the archive's contents.

> **Note:** Value will be resolved (see [`path.resolve`](https://nodejs.org/api/path.html#path_path_resolve_paths)) if not already an absolute path.

#### options
Type: `Object`<br>
Default: `{ strip:1 }`

All options are passed directly to [`tar.extract`](https://github.com/npm/node-tar#tarxoptions-filelist-callback-alias-tarextract).

> **Note:** The `cwd` and `file` options are set for you and _cannot_ be changed!

#### options.strip
Type: `Integer`<br>
Default: `1`

By default, `gittar` will strip the name of tarball from the extracted filepath.

```js
const file = 'lukeed/mri#master';

// strip:1 (default)
gittar.extract(file, 'foo');
//=> contents: foo/**

// strip:0 (retain tarball name)
gittar.extract(file, 'foo', { strip:0 });
//=> contents: foo/mri-master/**
```


## License

MIT © [Luke Edwards](https://lukeed.com)
