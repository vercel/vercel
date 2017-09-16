![now](https://github.com/zeit/art/blob/a7867d60f54a41127023a8740a221921df309d24/now-cli/repo-banner.png?raw=true)

[![Build Status](https://travis-ci.org/zeit/now-cli.svg?branch=master)](https://travis-ci.org/zeit/now-cli)
[![Slack Channel](http://zeit-slackin.now.sh/badge.svg)](https://zeit.chat/)

## Usage

Now enables instant immutable deployments to **any cloud provider**
with a simple API that's scalable, intuitive and optimized for collaboration.

This is all it takes to deploy, for example, a Node.js project:

```
cd my-project
cat server.js
```

```js
require('http').createServer((req, res) => {
  res.end('▲ Hello World')
}).listen(process.env.PORT)
```

and deploy!

```
now
```

The output of the `now` command will be a unique url to the deployment. No need for git.

## Features

- **Single command deployment**: `now`.
- **100% OSS** and licensed under Apache 2.0
- **Serverless**. Worry about code, not servers.
- **Immutable**. Every time you write `now`, a new deployment is provisioned.
- **Pluggable**. Client can query any public and private cloud provider APIs
- **Flexible**. Interact with multiple clouds at once: `now gcp deploy && now aws deploy`
- **Single command setup**: `now [provider] login`
- **Secure**. All deployments are served over SSL
- **Dynamic and Static**. Deploy popular runtimes or static websites
- **Remote fs support**. Deploy any github project with `now project/repo`, gitlab with `gitlab://`. [PRs welcome](https://github.com/zeit/now-cli/pulls)!

## Installation

To get the latest version, run this command:

```
npm install -g now
```

Note: while the API has been in production for over a year, the different
providers are still under heavy development

Optionally, you can clone this repo and run `npm run build` to
produce the [pkg](https://github.com/zeit/pkg) binaries.

## Setup

Configuration of one or more providers via `login` command is necessary.

Global configuration is stored as `~/.now/config.json`. Your default provider will be the first one you log in to. If you are logged into multiple providers and want to set default provider, run:

```
now config set defaultProvider gcp
```

### Now.sh

```
now login
```

To skip the configuration steps and deploy to `https://now.sh`
execute `now login` without any parameters, defaulting to the `sh` provider (equivalent to: `now sh login`).

[Now.sh](https://zeit.co/now) is _**free** for open-source projects and static deployments_. It supports `Dockerfile`, `package.json` and static sites out of the box. All builds are reproducible and executed in the cloud.

### AWS Lambda (`aws`)

Run:

```
now aws login
```

If you have already run `aws configure` before, you will be offered
to synchronize your credentials.

Serverless deployments are provisioned by using:

- Lambda functions λ
	- A proxy is automatically used to bridge the API between
	  HTTP and lambda functions and retain a consistent interface
- Certificate Manager
- API Gateway

### Google Cloud Platform (`gcp`)

```
$ now gcp login
```

and follow the instructions!

### Microsoft Azure (`az`)

```
$ now az login
```

and follow the instructions!

## <span id="configuration">Project Configuration</span>

<table>
<td>ℹ️</td><td>We welcome feedback from <a href="#community">the community</a>!</td>
</table>

The v1 release of `now.json` includes the following specification:

- `name` (optional, recommended) `String`
- `description` (optional, recommended) `String`
- `type` (optional, recommended). One of:
  - `String` an unique identifier for the project type. The following
    are recommended choices to be supported by every provider:
      - `docker`
      - `node`
      - `static`
  - `Object`
    when it's necessary to specify a version or multiple interacting runtimes. It's a dictionary of runtime identifier and [SemVer-compatible]() version. For example:
    ```
    { "type": { "docker": "1.x.x" } }
    ```
  - `provider` (optional) indicates affinity to a certain provider
- `target` (optional) `String`
  - specifies a directory or file to deploy. If relative, it's resolved
    to the project directory. This is useful when a certain
    deployment type (like `static`) has an output target, like an `out`
    or `dist` directory.
- `env` (optional). One of
  - `Object` a dictionary mapping the name of the environmental variable
    to expose to the deployment and its value.
    If the value begins with `@`, it's considered a
  - `Array` a list of suggested environmental variables that the project
    _might_ require to be deployed and function correctly
- `regions` - `Array` of `String`
  - specifies one or more regition identifiers to deploy to. A wildcard
    can be used to signify deployment to all supported regions by the
    provider
- `files` - `Array` of `String`
  - specifies a whitelist of what files have to be deployed

To supply provider-specific configuration, you can include an arbitrary `Object` and use the provider identifier as the key.

## <span id="global-config">Global Configuration</span>

The client will initialize a `.now` directory in the user's home
directory upon first running.

There, two files can be found:

- `config.json`
- `auth.json`

## Implementation notes

Now is directly modeled after UNIX. It's useful to think of the primary subcommands `deploy`, `alias` and `rm` as being the "cloud equivalents" of `cp`, `ln` and `rm`.

The minimal set of commands that providers must supply are:

<table>
  <tr>
    <td><code>[]</code> | <code>deploy</code></td>
    <td>the default command to launch a deployment</td>
  </tr>
  <tr>
	<td><code>remove</code> | <code>rm</code></td>
	<td>remove a deployment identified by its unique URL</td>
  </tr>
</table>

Recommended, but not required, commands are:

<table>
  <tr>
    <td><code>alias</code> | <code>ln</code></td>
    <td>associates a URL with a permanent domain name</td>
  </tr>
  <tr>
    <td><code>secrets</code> <code>ls</code> | <code>rm</code> | <code>add</code></td>
    <td>manage deployment secrets</td>
  </tr>
  <tr>
  	<td><code>domains</code> <code>ls</code> | <code>add</code> | <code>rm</code></td>
  	<td>manage domains</td>
  </tr>
  <tr>
  	<td><code>dns</code> <code>ls</code> | <code>add</code> | <code>rm</code></td>
  	<td>manage dns records</td>
  </tr>
  <tr>
<td><code>certs</code> <code>ls</code> | <code>add</code> | 	<code>rm</code></td>
	<td>manage certificates</td>
  </tr>
</table>

The `build` step for serverless deployments is implemented locally and is compatible with projects configured with the `type` `node`, and others are on the way!

## Philosophy

### Immutability

Each time you write `now` a new deployment is provisioned. Whenever
possible, providers should strive to make deployments idempotent in the
absence of changes to:

- Originating source code
- Configuration
- Environment variables

### Standards compliance

All projects expose a HTTP/1.1-compatible interface. A port is provided
via the standard `process.env.PORT`.

### Secure

Whenever possible, deployments are strongly encouraged to be served over SSL. The process of provisioning certificates should be transparent to the user.

### Projects should require minimal JSON configuration

Whenever possible, projects should be deployable with minimal or no configuration.

### Avoid manifest duplication

If the configuration or conventions imposed by a programming language
or framework are present, attempt to provide sane defaults.

Examples of this is the presence of `Dockerfile` or `package.json`. When
publishing a project it's recommended that the [`type`](#type) is strictly
configured in [`now.json`](#now-json) to avoid

## Contributions and Roadmap

#### Community

All feedback and suggestions are welcome!

- 💬 Chat: Join us on [zeit.chat](https://zeit.chat) `#now-client`.
- 📣 Stay up to date on new features and announcments on [@zeithq](https://twitter.com/zeithq).
- 🔐 Subscribe to our [security](http://zeit.us12.list-manage1.com/subscribe?u=3c9e9e13d7e6dae8faf375bed&id=110e586914) mailing list to stay up-to-date on urgent security disclosures.

Please note: we adhere to the [contributor coventant](http://contributor-covenant.org/) for
all interactions in our community.

#### Contributions

To get started contributing, make sure you're running `node` `8.x.x`. Clone this repository:

```
git clone https://github.com/zeit/now-cli
```

To test the [`pkg`](https://github.com/zeit/pkg) binary distribution, run:

```
npm run build
```

#### Ongoing development

- Support for `now <file>`, with support for:
	- Binaries as a first-class deployment type
	- Static deployments as a fallback
- We are working on built-in support for provisioning [Kubernetes](https://kubernetes.io/)
  replication controllers and pods, in a similar vein as the [Draft](https://github.com/azure/draft) project.
- A simple API to register custom providers and pluggable build systems externally, such as Travis, Circle CI, etc.
- A companion desktop app [Now Desktop](https://github.com/zeit/now-desktop)
  is available, released under the MIT license.
  Work is ongoing for pluggable providers to enable:
  - Team collaboration
  - One-click context switch
  - Drag and drop deployments
- Adding interoperabity between objects that live in different providers
- Providing a Next.js and React powered dashboard that can be deployed anywhere

## Why Ship a `pkg`-ed Binary?

- Simpler installation for non-Node users like those deploying [static files](https://zeit.co/blog/unlimited-static) or [Dockerfiles](https://zeit.co/blog/now-dockerfile).
- Consistency across platforms and installation mechanisms (`npm`, `brew` and manual scripts)
- Parsing and evaluation optimizations lead to a faster bootup time
- Easier installation in automation environments (like CI systems)
- Increased safety by providing a unified signature mechanism for releases
- We're able to select our own Node version of choice and can take advantage of the latest features

## Caught a Bug?

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device
2. Link the package to the global module directory: `npm run link` (not `npm link`)
3. You can now start using `now` from the command line!

As always, you can use `npm test` to run the tests and see if your changes have broken anything.

## Authors

- Guillermo Rauch ([@rauchg](https://twitter.com/rauchg)) - [▲ZEIT](https://zeit.co)
- Leo Lamprecht ([@notquiteleo](https://twitter.com/notquiteleo)) - [▲ZEIT](https://zeit.co)
- Tony Kovanen ([@TonyKovanen](https://twitter.com/TonyKovanen)) - [▲ZEIT](https://zeit.co)
- Olli Vanhoja ([@OVanhoja](https://twitter.com/OVanhoja)) - [▲ZEIT](https://zeit.co)
- Naoyuki Kanezawa ([@nkzawa](https://twitter.com/nkzawa)) - [▲ZEIT](https://zeit.co)
