# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.3.17](https://github.com/unjs/mlly/compare/v0.3.16...v0.3.17) (2022-01-07)


### Bug Fixes

* get actual protocol for windows instead of protocol + drive ([#28](https://github.com/unjs/mlly/issues/28)) ([15140cc](https://github.com/unjs/mlly/commit/15140cca5352b2b839bb06887dfe66bd369fa7f1))

### [0.3.16](https://github.com/unjs/mlly/compare/v0.3.15...v0.3.16) (2021-12-17)


### Bug Fixes

* improve esm detection with export declartion ([#27](https://github.com/unjs/mlly/issues/27)) ([0511a93](https://github.com/unjs/mlly/commit/0511a93d3565f3a2a6679fc09a3e6ce349724478))

### [0.3.15](https://github.com/unjs/mlly/compare/v0.3.14...v0.3.15) (2021-11-29)


### Features

* initial code generation utils ([5fdb9f2](https://github.com/unjs/mlly/commit/5fdb9f2e885230d8008916131f584f7e2c07296c))

### [0.3.14](https://github.com/unjs/mlly/compare/v0.3.13...v0.3.14) (2021-11-29)


### Bug Fixes

* **findExports:** detect `async function` ([9fcc555](https://github.com/unjs/mlly/commit/9fcc5551bfbc188781b7d59dcd8383921fbd4ae9))

### [0.3.13](https://github.com/unjs/mlly/compare/v0.3.12...v0.3.13) (2021-11-11)


### Bug Fixes

* **findExports:** normalize named exports ([b82d27b](https://github.com/unjs/mlly/commit/b82d27bb48ae101531bcc62a5e79671be6151769))

### [0.3.12](https://github.com/unjs/mlly/compare/v0.3.11...v0.3.12) (2021-11-03)


### Features

* add `sanitizeURIComponent` and `sanitizeFilePath` helpers ([#22](https://github.com/unjs/mlly/issues/22)) ([9ddeab8](https://github.com/unjs/mlly/commit/9ddeab866e5dc5637f1500cfd4487c034100dc8e))

### [0.3.11](https://github.com/unjs/mlly/compare/v0.3.10...v0.3.11) (2021-11-02)


### Bug Fixes

* exclude windows drive letters from protocols ([#21](https://github.com/unjs/mlly/issues/21)) ([94d3506](https://github.com/unjs/mlly/commit/94d350699a132fe0d5f25031f09dc5117cf659db))

### [0.3.10](https://github.com/unjs/mlly/compare/v0.3.9...v0.3.10) (2021-10-28)


### Features

* support protocols for `isValidNodeImport` ([#20](https://github.com/unjs/mlly/issues/20)) ([0cfa4d9](https://github.com/unjs/mlly/commit/0cfa4d927acffc09beb8c0af7862d9c02046dfe5))

### [0.3.9](https://github.com/unjs/mlly/compare/v0.3.8...v0.3.9) (2021-10-28)


### Bug Fixes

* prevent more false positives on cjs ([#19](https://github.com/unjs/mlly/issues/19)) ([8ac4b74](https://github.com/unjs/mlly/commit/8ac4b7424392dba14c1dbc5aacb84dc4b274bb6c))

### [0.3.8](https://github.com/unjs/mlly/compare/v0.3.7...v0.3.8) (2021-10-27)


### Bug Fixes

* import detection improvements ([#18](https://github.com/unjs/mlly/issues/18)) ([b99bf2c](https://github.com/unjs/mlly/commit/b99bf2ce9b37e628f681831553d817a8bdfa7e39))

### [0.3.7](https://github.com/unjs/mlly/compare/v0.3.6...v0.3.7) (2021-10-27)


### Features

* add `isValidNodeImport` utility ([#16](https://github.com/unjs/mlly/issues/16)) ([32ef24a](https://github.com/unjs/mlly/commit/32ef24a86371b50019c07417e90e05aef5d4bb44))

### [0.3.6](https://github.com/unjs/mlly/compare/v0.3.5...v0.3.6) (2021-10-27)


### Features

* **resolve:** automatically add `node_modules` to search path ([7b03715](https://github.com/unjs/mlly/commit/7b03715485bf421a4aef1b2010c9a24599deeedd))

### [0.3.5](https://github.com/unjs/mlly/compare/v0.3.4...v0.3.5) (2021-10-27)


### Features

* detect esm/cjs syntax ([#12](https://github.com/unjs/mlly/issues/12)) ([477d76e](https://github.com/unjs/mlly/commit/477d76ebcd2f01478ce5a2e01bb6b253454f2587))


### Bug Fixes

* **resolve:** don't normalize falsy urls ([9fdf8f6](https://github.com/unjs/mlly/commit/9fdf8f64b72c9efd1f9535e79ecfeec6780939ec))
* **types:** make options optional ([9240f07](https://github.com/unjs/mlly/commit/9240f07c49df0591e00f83a7998a5158a898983a))

### [0.3.4](https://github.com/unjs/mlly/compare/v0.3.3...v0.3.4) (2021-10-27)


### Bug Fixes

* **resolve:** resolve absolute paths as-is ([c6e4f9f](https://github.com/unjs/mlly/commit/c6e4f9f3fce6010cc6b3a4b3991a43b20ec6550e))

### [0.3.3](https://github.com/unjs/mlly/compare/v0.3.2...v0.3.3) (2021-10-27)


### Bug Fixes

* correct `ResolveOptions.url` type ([e432175](https://github.com/unjs/mlly/commit/e432175b11077f5116521211360af959a76f8fc8))

### [0.3.2](https://github.com/unjs/mlly/compare/v0.3.1...v0.3.2) (2021-10-27)


### Features

* **resolve:** support resolving from multiple paths or urls ([8d51348](https://github.com/unjs/mlly/commit/8d5134807b44ea92c14785343a38486fc155957c))

### [0.3.1](https://github.com/unjs/mlly/compare/v0.3.0...v0.3.1) (2021-10-22)


### Bug Fixes

* add missing `name` and `names` to `ESMExport` interface ([#13](https://github.com/unjs/mlly/issues/13)) ([c5eacfb](https://github.com/unjs/mlly/commit/c5eacfb6b392395d6d568daaeaea80d322b90a36))

## [0.3.0](https://github.com/unjs/mlly/compare/v0.2.10...v0.3.0) (2021-10-20)


### ⚠ BREAKING CHANGES

* rewrite with typescript

### Features

* rewrite with typescript ([b085827](https://github.com/unjs/mlly/commit/b085827a9cf575bde8dd71841c02eaaa802d829a))


### Bug Fixes

* **pkg:** inline `import-meta-resolve` ([50f13b1](https://github.com/unjs/mlly/commit/50f13b1a2cb4c191d1546f224b4315ed8948ed78))

### [0.2.10](https://github.com/unjs/mlly/compare/v0.2.9...v0.2.10) (2021-10-18)


### Bug Fixes

* **interopDefault:** handle non-object inputs ([0d73a44](https://github.com/unjs/mlly/commit/0d73a444e42897b6ecaaf435a7ddd8a17c5afbfa))

### [0.2.9](https://github.com/unjs/mlly/compare/v0.2.8...v0.2.9) (2021-10-18)


### Bug Fixes

* type guards ([#10](https://github.com/unjs/mlly/issues/10)) ([b92cd94](https://github.com/unjs/mlly/commit/b92cd94c6c97b09211bbf2ebf229fc1a3cf68b7e))

### [0.2.8](https://github.com/unjs/mlly/compare/v0.2.7...v0.2.8) (2021-10-15)


### Bug Fixes

* **types:** types for findExports ([#9](https://github.com/unjs/mlly/issues/9)) ([68b7c39](https://github.com/unjs/mlly/commit/68b7c394cb032af2c93d7f14a63847bb0c643d73))

### [0.2.7](https://github.com/unjs/mlly/compare/v0.2.6...v0.2.7) (2021-10-14)


### Features

* export analyzes with `findExports` ([#8](https://github.com/unjs/mlly/issues/8)) ([2eebbd5](https://github.com/unjs/mlly/commit/2eebbd50262992cd500935ba530d5f99e8ad8dcf))

### [0.2.6](https://github.com/unjs/mlly/compare/v0.2.5...v0.2.6) (2021-10-12)


### Bug Fixes

* **interopDefault:** do not override existing props ([#7](https://github.com/unjs/mlly/issues/7)) ([9429606](https://github.com/unjs/mlly/commit/9429606cd03b17d9e0a1f67a0f4c43977828ec4c))

### [0.2.5](https://github.com/unjs/mlly/compare/v0.2.4...v0.2.5) (2021-10-05)


### Features

* add `interopDefault` util ([#6](https://github.com/unjs/mlly/issues/6)) ([0c49451](https://github.com/unjs/mlly/commit/0c494516e463956e3ab8f4dede9d22bda2518272))

### [0.2.4](https://github.com/unjs/mlly/compare/v0.2.3...v0.2.4) (2021-10-01)


### Features

* add types for import analyzes ([b9ca4af](https://github.com/unjs/mlly/commit/b9ca4aff597453877674f0c9ebf504f19f989ea1))

### [0.2.3](https://github.com/unjs/mlly/compare/v0.2.2...v0.2.3) (2021-10-01)


### Features

* static import analyzes tools ([#3](https://github.com/unjs/mlly/issues/3)) ([8193226](https://github.com/unjs/mlly/commit/8193226dc48f83a3dbf957db1d6c56d1684273e2))

### [0.2.2](https://github.com/unjs/mlly/compare/v0.2.1...v0.2.2) (2021-09-20)


### Bug Fixes

* add missing require to cjs interface ([9bdffc3](https://github.com/unjs/mlly/commit/9bdffc3991c53335f34ce64d51a839e3e0c0cd2c))

### [0.2.1](https://github.com/unjs/mlly/compare/v0.2.0...v0.2.1) (2021-09-20)


### Bug Fixes

* **createResolve:** make url optional ([40de473](https://github.com/unjs/mlly/commit/40de473ddc94de1ba17b6f46b36115e99e51e836))

## [0.2.0](https://github.com/unjs/mlly/compare/v0.1.7...v0.2.0) (2021-07-23)


### ⚠ BREAKING CHANGES

* directly use a url to create cjs context

### Features

* rewrite error stack for inline scripts ([7357aeb](https://github.com/unjs/mlly/commit/7357aeb4b7b6eca234f8622fd8d2d833c1129518))


* directly use a url to create cjs context ([e7012fb](https://github.com/unjs/mlly/commit/e7012fb38015fd3a0d38f40829b3e8042c8e7f1f))

### [0.1.7](https://github.com/unjs/mlly/compare/v0.1.6...v0.1.7) (2021-07-23)

### [0.1.6](https://github.com/unjs/mlly/compare/v0.1.5...v0.1.6) (2021-07-23)


### Features

* json support ([81c12af](https://github.com/unjs/mlly/commit/81c12af219abc7b86cc551605e8eace96debb497))


### Bug Fixes

* resolve bug fixes ([e5946df](https://github.com/unjs/mlly/commit/e5946df14ebdcc994a2f464c07a5439b67359559))

### [0.1.5](https://github.com/unjs/mlly/compare/v0.1.4...v0.1.5) (2021-07-22)


### Features

* support extensions and index resolution ([8f4c080](https://github.com/unjs/mlly/commit/8f4c08005a6056cc14d9d9d63e3b921cb879ec1d))
* support url option for evaluation ([0a78f45](https://github.com/unjs/mlly/commit/0a78f451a3d3163541079f213eeb3a5898fba964))

### [0.1.4](https://github.com/unjs/mlly/compare/v0.1.3...v0.1.4) (2021-07-22)


### Features

* normalizeid and use it to support `from` as path ([14af3d1](https://github.com/unjs/mlly/commit/14af3d18392c0bcb10577f70808dda6cdeca1fb5))


### Bug Fixes

* skip fileURLToPath when id is not file: protocol ([c40b810](https://github.com/unjs/mlly/commit/c40b8100f54ee0f500f848c6d388bf7cdf16b9a9))

### [0.1.3](https://github.com/unjs/mlly/compare/v0.1.2...v0.1.3) (2021-07-22)

### [0.1.2](https://github.com/unjs/mlly/compare/v0.1.1...v0.1.2) (2021-07-22)


### Features

* expose resolveImports and improve docs ([074ef52](https://github.com/unjs/mlly/commit/074ef52a3724518b2fdd43e5a647ab7ceac51084))

### 0.1.1 (2021-07-22)


### Features

* add eval utils and other improvements ([1fe0b69](https://github.com/unjs/mlly/commit/1fe0b69910064c179dd4de5a7a02e6e250e9f19a))
* add resolve utils ([1d1a3ac](https://github.com/unjs/mlly/commit/1d1a3ac957e7f05214bcc7ed0af1ec5d6fe7785b))
