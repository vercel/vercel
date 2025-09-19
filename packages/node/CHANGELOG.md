# @vercel/node

## 5.3.24

### Patch Changes

- Add support for public asset folder for Hono preset ([#13958](https://github.com/vercel/vercel/pull/13958))

## 5.3.23

### Patch Changes

- Add support for inlclude/exclude files config from vercel.json ([#13946](https://github.com/vercel/vercel/pull/13946))

## 5.3.22

### Patch Changes

- Revert change to module resolution which slowed down Typescript builds for functions ([#13897](https://github.com/vercel/vercel/pull/13897))

## 5.3.21

### Patch Changes

- Add support for public asset folder for Express preset ([#13879](https://github.com/vercel/vercel/pull/13879))

## 5.3.20

### Patch Changes

- Support package.json#main field as the entrypoint ([#13846](https://github.com/vercel/vercel/pull/13846))

- Fix issue where install scripts from project settings didn't pick up the appropriate pnpm version ([#13846](https://github.com/vercel/vercel/pull/13846))

- Updated dependencies [[`fa9310f879f9e4c72c64bbf542e1e242914f800f`](https://github.com/vercel/vercel/commit/fa9310f879f9e4c72c64bbf542e1e242914f800f)]:
  - @vercel/build-utils@12.1.0

## 5.3.19

### Patch Changes

- Always compile `.mts` to ESM ([#13693](https://github.com/vercel/vercel/pull/13693))

## 5.3.18

### Patch Changes

- Updated dependencies [[`d1ca3ed3ac1b9830403dc9dc3520e963ef8bec8e`](https://github.com/vercel/vercel/commit/d1ca3ed3ac1b9830403dc9dc3520e963ef8bec8e)]:
  - @vercel/build-utils@12.0.0

## 5.3.17

### Patch Changes

- Add .cts support to express and hono builders ([#13828](https://github.com/vercel/vercel/pull/13828))

- Add support for http listener when it's not default exported ([#13826](https://github.com/vercel/vercel/pull/13826))

- Fix issue where install scripts from project settings didn't pick up the appropriate pnpm version ([#13840](https://github.com/vercel/vercel/pull/13840))

## 5.3.16

### Patch Changes

- Updated dependencies [[`6260486192ca407fc2d91f317ed81533548b8629`](https://github.com/vercel/vercel/commit/6260486192ca407fc2d91f317ed81533548b8629)]:
  - @vercel/static-config@3.1.2

## 5.3.15

### Patch Changes

- Add support for specifying an output directory for Express and Hono apps ([#13805](https://github.com/vercel/vercel/pull/13805))

- [next][node][redwood][remix] bump `@vercel/nft@0.30.1` ([#13818](https://github.com/vercel/vercel/pull/13818))

## 5.3.14

### Patch Changes

- Updated dependencies [[`28a41c6fddc7a3bc92fa54279063428b329e3104`](https://github.com/vercel/vercel/commit/28a41c6fddc7a3bc92fa54279063428b329e3104)]:
  - @vercel/build-utils@11.0.2

## 5.3.13

### Patch Changes

- Support running project build script for node builder if its being treated as the project's primary builder ([#13767](https://github.com/vercel/vercel/pull/13767))

## 5.3.12

### Patch Changes

- Add `.mts` support to node builder ([#13687](https://github.com/vercel/vercel/pull/13687))

- Skip lib check on node dev server ([#13696](https://github.com/vercel/vercel/pull/13696))

- Updated dependencies [[`8a020e07c2116833bbe39ee43f62efad9f7de0de`](https://github.com/vercel/vercel/commit/8a020e07c2116833bbe39ee43f62efad9f7de0de)]:
  - @vercel/build-utils@11.0.1

## 5.3.11

### Patch Changes

- Support fetchable apps out of the box for Node dev server. ([#13664](https://github.com/vercel/vercel/pull/13664))

  Support CommonJS for Hono

## 5.3.10

### Patch Changes

- Fix issue where .mjs files weren't transpiled properly for Hono ([#13658](https://github.com/vercel/vercel/pull/13658))

## 5.3.9

### Patch Changes

- Fix relative path issue when Hono builder uses the Node builder ([#13649](https://github.com/vercel/vercel/pull/13649))

## 5.3.8

### Patch Changes

- Fix issue with hono support in monorepos ([#13642](https://github.com/vercel/vercel/pull/13642))

## 5.3.7

### Patch Changes

- Adds framework detection and an associated builder for Hono. ([#13594](https://github.com/vercel/vercel/pull/13594))

- Updated dependencies [[`b79db72d870a8d2e98e36a7413c656ae80fed01f`](https://github.com/vercel/vercel/commit/b79db72d870a8d2e98e36a7413c656ae80fed01f)]:
  - @vercel/build-utils@11.0.0

## 5.3.6

### Patch Changes

- Reverting support for `preferredRegion` ([#13566](https://github.com/vercel/vercel/pull/13566))

- Updated dependencies [[`bae121f5ba238a7e98ac6159bc4cf36e23c33142`](https://github.com/vercel/vercel/commit/bae121f5ba238a7e98ac6159bc4cf36e23c33142)]:
  - @vercel/build-utils@10.6.7

## 5.3.5

### Patch Changes

- Updated dependencies [[`f37cd4e2eb35764a658f617643e2ab228191e7e2`](https://github.com/vercel/vercel/commit/f37cd4e2eb35764a658f617643e2ab228191e7e2)]:
  - @vercel/build-utils@10.6.6

## 5.3.4

### Patch Changes

- Updated dependencies [[`ed2d1c1ea934e803c5e656b1663034176aef2f27`](https://github.com/vercel/vercel/commit/ed2d1c1ea934e803c5e656b1663034176aef2f27)]:
  - @vercel/build-utils@10.6.5

## 5.3.3

### Patch Changes

- Updated dependencies [[`dc424e1b09230e35f4953e2c4d1ccdab18f57d8c`](https://github.com/vercel/vercel/commit/dc424e1b09230e35f4953e2c4d1ccdab18f57d8c)]:
  - @vercel/build-utils@10.6.4

## 5.3.2

### Patch Changes

- Updated dependencies [[`612f2af54c05ed758243122fe9ef2743c8ebd4c8`](https://github.com/vercel/vercel/commit/612f2af54c05ed758243122fe9ef2743c8ebd4c8), [`abf657ed5d52caa8965dcd3147174e940cca72b1`](https://github.com/vercel/vercel/commit/abf657ed5d52caa8965dcd3147174e940cca72b1)]:
  - @vercel/build-utils@10.6.3

## 5.3.1

### Patch Changes

- Updated dependencies [[`7103cde0b7e0468773d1c596e223105233260e40`](https://github.com/vercel/vercel/commit/7103cde0b7e0468773d1c596e223105233260e40)]:
  - @vercel/build-utils@10.6.2

## 5.3.0

### Minor Changes

- Allow to set Node.js runtime for middleware ([#13461](https://github.com/vercel/vercel/pull/13461))

## 5.2.2

### Patch Changes

- Updated dependencies [[`826539f0236c5532c473e2490da6ea797d363423`](https://github.com/vercel/vercel/commit/826539f0236c5532c473e2490da6ea797d363423), [`3c6cc512cf74439053b3614f95fcdf211c2d8a6d`](https://github.com/vercel/vercel/commit/3c6cc512cf74439053b3614f95fcdf211c2d8a6d), [`ff37e3c80d945d98696c05071b3b3c95fe78212f`](https://github.com/vercel/vercel/commit/ff37e3c80d945d98696c05071b3b3c95fe78212f)]:
  - @vercel/build-utils@10.6.1

## 5.2.1

### Patch Changes

- support `config.regions` and `config.preferredRegion` in functions ([#13386](https://github.com/vercel/vercel/pull/13386))

- Updated dependencies [[`6c8e763ab63c79e12c7d5455fd79cf158f43cc77`](https://github.com/vercel/vercel/commit/6c8e763ab63c79e12c7d5455fd79cf158f43cc77)]:
  - @vercel/static-config@3.1.1

## 5.2.0

### Minor Changes

- Allow configuring functions `architecture` via the `vercel.json` configuration ([#13344](https://github.com/vercel/vercel/pull/13344))

### Patch Changes

- Updated dependencies [[`36cd6a44bf4daf429babb430c7f1e3f7130d30ee`](https://github.com/vercel/vercel/commit/36cd6a44bf4daf429babb430c7f1e3f7130d30ee), [`0d86d9c3fa61ae91f0ed4ffe4c0c97655411468f`](https://github.com/vercel/vercel/commit/0d86d9c3fa61ae91f0ed4ffe4c0c97655411468f)]:
  - @vercel/build-utils@10.6.0
  - @vercel/static-config@3.1.0

## 5.1.16

### Patch Changes

- Bump @vercel/nft to latest ([#13312](https://github.com/vercel/vercel/pull/13312))

## 5.1.15

### Patch Changes

- Make backwards compatible with pnpm 10 ([#13268](https://github.com/vercel/vercel/pull/13268))

## 5.1.14

### Patch Changes

- Updated dependencies [[`9c5bcad83a8e8b75bd7371649d1287890f33bb47`](https://github.com/vercel/vercel/commit/9c5bcad83a8e8b75bd7371649d1287890f33bb47), [`6ada3b30626582e9bad11a450a6b79bb387d6d49`](https://github.com/vercel/vercel/commit/6ada3b30626582e9bad11a450a6b79bb387d6d49)]:
  - @vercel/build-utils@10.5.1

## 5.1.13

### Patch Changes

- [cli] get maxDuration from function configuration ([#13141](https://github.com/vercel/vercel/pull/13141))

- Updated dependencies [[`ac8efbbd20e6d006dfd050c452cf3ef28f7bb9a7`](https://github.com/vercel/vercel/commit/ac8efbbd20e6d006dfd050c452cf3ef28f7bb9a7)]:
  - @vercel/build-utils@10.5.0

## 5.1.12

### Patch Changes

- Updated dependencies [[`47e5335cadc62398600c456c09120582adb25c88`](https://github.com/vercel/vercel/commit/47e5335cadc62398600c456c09120582adb25c88)]:
  - @vercel/build-utils@10.4.0

## 5.1.11

### Patch Changes

- Updated dependencies [[`9f715de0aab615e5fb506a3a905a8076134e9f95`](https://github.com/vercel/vercel/commit/9f715de0aab615e5fb506a3a905a8076134e9f95), [`ae369a7b89bd328504b1c0a5fe83d4affb13e71f`](https://github.com/vercel/vercel/commit/ae369a7b89bd328504b1c0a5fe83d4affb13e71f)]:
  - @vercel/build-utils@10.3.2

## 5.1.10

### Patch Changes

- Updated dependencies [[`55008433b9ed9fe565142285f548f6d84cc021cc`](https://github.com/vercel/vercel/commit/55008433b9ed9fe565142285f548f6d84cc021cc), [`5155a42d1c193b0aba412c8d6be74782d40057ac`](https://github.com/vercel/vercel/commit/5155a42d1c193b0aba412c8d6be74782d40057ac), [`70bec851b77ec3093723da2fbadfd82ea7ffd5f3`](https://github.com/vercel/vercel/commit/70bec851b77ec3093723da2fbadfd82ea7ffd5f3)]:
  - @vercel/build-utils@10.3.1

## 5.1.9

### Patch Changes

- Updated dependencies [[`5211cd0493b9ec7e352860d1fd238d7fae1e9a5b`](https://github.com/vercel/vercel/commit/5211cd0493b9ec7e352860d1fd238d7fae1e9a5b), [`9143b8ccecbc7d3427a5534acfb00a0493e92fb2`](https://github.com/vercel/vercel/commit/9143b8ccecbc7d3427a5534acfb00a0493e92fb2)]:
  - @vercel/build-utils@10.3.0

## 5.1.8

### Patch Changes

- Updated dependencies [[`adb1f80db1337f10c6310e3d05bbabb7bac3f05d`](https://github.com/vercel/vercel/commit/adb1f80db1337f10c6310e3d05bbabb7bac3f05d), [`00c622d4497d37932d17571854c19bd2340d5c36`](https://github.com/vercel/vercel/commit/00c622d4497d37932d17571854c19bd2340d5c36), [`ef75bcc0ef2400f4f704f500b09a0f20e1f0d0a0`](https://github.com/vercel/vercel/commit/ef75bcc0ef2400f4f704f500b09a0f20e1f0d0a0), [`1b5c53642abca43ce6223f1f58d1586ee2fd87b1`](https://github.com/vercel/vercel/commit/1b5c53642abca43ce6223f1f58d1586ee2fd87b1)]:
  - @vercel/build-utils@10.2.0

## 5.1.7

### Patch Changes

- Updated dependencies [[`09c9c9fb0bb1ca4c23a7f1547c4d51b05f4eae24`](https://github.com/vercel/vercel/commit/09c9c9fb0bb1ca4c23a7f1547c4d51b05f4eae24)]:
  - @vercel/build-utils@10.1.0

## 5.1.6

### Patch Changes

- Updated dependencies [[`5f8cc837c400ee7b493caa03931310637193ed24`](https://github.com/vercel/vercel/commit/5f8cc837c400ee7b493caa03931310637193ed24), [`f25215c31d972cacb29ad254e768f993445e2a07`](https://github.com/vercel/vercel/commit/f25215c31d972cacb29ad254e768f993445e2a07), [`244c4101e68edcc82c920e713172a7d109916f03`](https://github.com/vercel/vercel/commit/244c4101e68edcc82c920e713172a7d109916f03), [`c98677c379b92654b6e9d03bef5f7ec1173cb93d`](https://github.com/vercel/vercel/commit/c98677c379b92654b6e9d03bef5f7ec1173cb93d)]:
  - @vercel/build-utils@10.0.1

## 5.1.5

### Patch Changes

- Updated dependencies [[`e4972fa9adbecd19687aff71ec22b46ce0f3a4fb`](https://github.com/vercel/vercel/commit/e4972fa9adbecd19687aff71ec22b46ce0f3a4fb)]:
  - @vercel/build-utils@10.0.0

## 5.1.4

### Patch Changes

- Updated dependencies [[`3688e7b3206f69f2456a9963c9e30077cab3fbd4`](https://github.com/vercel/vercel/commit/3688e7b3206f69f2456a9963c9e30077cab3fbd4), [`c93dbecb641890d2936547395d7744a5c197800a`](https://github.com/vercel/vercel/commit/c93dbecb641890d2936547395d7744a5c197800a)]:
  - @vercel/build-utils@9.3.1

## 5.1.3

### Patch Changes

- Updated dependencies [[`cc0b7194b119f72f59f77f9fba7e7a1188dac03c`](https://github.com/vercel/vercel/commit/cc0b7194b119f72f59f77f9fba7e7a1188dac03c)]:
  - @vercel/build-utils@9.3.0

## 5.1.2

### Patch Changes

- Updated dependencies [[`5c404c56702ff8685628ffe0db8a90e8cb87568a`](https://github.com/vercel/vercel/commit/5c404c56702ff8685628ffe0db8a90e8cb87568a)]:
  - @vercel/build-utils@9.2.1

## 5.1.1

### Patch Changes

- better path-to-regexp diff logging ([#12962](https://github.com/vercel/vercel/pull/12962))

## 5.1.0

### Minor Changes

- Add .yarn/cache to build cache ([#12961](https://github.com/vercel/vercel/pull/12961))

### Patch Changes

- Updated dependencies [[`5c696af2b40f0fc368e84cafa6d82b2ce998fc19`](https://github.com/vercel/vercel/commit/5c696af2b40f0fc368e84cafa6d82b2ce998fc19)]:
  - @vercel/build-utils@9.2.0

## 5.0.5

### Patch Changes

- Updated dependencies [[`b52b7e3a8cd775d56149683cb809b7ad9c77a514`](https://github.com/vercel/vercel/commit/b52b7e3a8cd775d56149683cb809b7ad9c77a514)]:
  - @vercel/build-utils@9.1.1

## 5.0.4

### Patch Changes

- log diff between current and updated versions of path-to-regexp ([#12926](https://github.com/vercel/vercel/pull/12926))

## 5.0.3

### Patch Changes

- Fix requests failing due to the presence of `Transfer-Encoding` header in edge-function dev server. ([#10701](https://github.com/vercel/vercel/pull/10701))

- Split `build()`, `prepareCache()` and `startDevServer()` into separate files ([#12872](https://github.com/vercel/vercel/pull/12872))

- Updated dependencies [[`745404610a836fa6c2068c5c192d2f3e8b86918f`](https://github.com/vercel/vercel/commit/745404610a836fa6c2068c5c192d2f3e8b86918f), [`3a5507fd1459c77b4491f1c9c3a64ad42e4ff009`](https://github.com/vercel/vercel/commit/3a5507fd1459c77b4491f1c9c3a64ad42e4ff009)]:
  - @vercel/build-utils@9.1.0

## 5.0.2

### Patch Changes

- Upgrade @vercel/nft to 0.27.10 ([#12109](https://github.com/vercel/vercel/pull/12109))

- Updated dependencies [[`e570a1660c2b18a41d8c3985e645a175a44a5ea4`](https://github.com/vercel/vercel/commit/e570a1660c2b18a41d8c3985e645a175a44a5ea4)]:
  - @vercel/build-utils@9.0.1

## 5.0.1

### Patch Changes

- Updated dependencies [[`e6b0343585cc3cdf02467fd3264b1f57b2ffb0da`](https://github.com/vercel/vercel/commit/e6b0343585cc3cdf02467fd3264b1f57b2ffb0da), [`e6b0343585cc3cdf02467fd3264b1f57b2ffb0da`](https://github.com/vercel/vercel/commit/e6b0343585cc3cdf02467fd3264b1f57b2ffb0da), [`e6b0343585cc3cdf02467fd3264b1f57b2ffb0da`](https://github.com/vercel/vercel/commit/e6b0343585cc3cdf02467fd3264b1f57b2ffb0da)]:
  - @vercel/build-utils@9.0.0

## 5.0.0

### Major Changes

- [remix-builder][node][routing-utils] revert path-to-regexp updates ([#12746](https://github.com/vercel/vercel/pull/12746))

## 4.0.0

### Major Changes

- update path-to-regexp ([#12734](https://github.com/vercel/vercel/pull/12734))

### Patch Changes

- Updated dependencies [[`7c3114ff8a1bdf0933c008a83e46c3d8f6dfcf7d`](https://github.com/vercel/vercel/commit/7c3114ff8a1bdf0933c008a83e46c3d8f6dfcf7d)]:
  - @vercel/build-utils@8.8.0

## 3.2.29

### Patch Changes

- update express even more ([#12703](https://github.com/vercel/vercel/pull/12703))

- Updated dependencies [[`a35f77e5dddc4faa6c4492b2b3c6971e7200749e`](https://github.com/vercel/vercel/commit/a35f77e5dddc4faa6c4492b2b3c6971e7200749e)]:
  - @vercel/build-utils@8.7.0

## 3.2.28

### Patch Changes

- [cli] bump express version ([#12689](https://github.com/vercel/vercel/pull/12689))

## 3.2.27

### Patch Changes

- Updated dependencies [[`d5474ec05886abfb2fc5dd69c54072a7c34498b5`](https://github.com/vercel/vercel/commit/d5474ec05886abfb2fc5dd69c54072a7c34498b5)]:
  - @vercel/build-utils@8.6.0

## 3.2.26

### Patch Changes

- Updated dependencies [[`a97f3f13ea3f27fd143e7692544bbd4919771a7a`](https://github.com/vercel/vercel/commit/a97f3f13ea3f27fd143e7692544bbd4919771a7a)]:
  - @vercel/build-utils@8.5.0

## 3.2.25

### Patch Changes

- Updated dependencies [[`79fbf1c95f4fa9bfe6af17aa3e13cf18424fc521`](https://github.com/vercel/vercel/commit/79fbf1c95f4fa9bfe6af17aa3e13cf18424fc521)]:
  - @vercel/error-utils@2.0.3

## 3.2.24

### Patch Changes

- Updated dependencies [[`5a6605bbd99c3b4c3f06fc315dd3978fe7801d00`](https://github.com/vercel/vercel/commit/5a6605bbd99c3b4c3f06fc315dd3978fe7801d00)]:
  - @vercel/build-utils@8.4.12

## 3.2.23

### Patch Changes

- Updated dependencies [[`d01c6b98d6f5f2718b69edec71b4aec40822bfe6`](https://github.com/vercel/vercel/commit/d01c6b98d6f5f2718b69edec71b4aec40822bfe6), [`3a2c2529c642cc2efc11d08a18f2da2ff423b15f`](https://github.com/vercel/vercel/commit/3a2c2529c642cc2efc11d08a18f2da2ff423b15f)]:
  - @vercel/build-utils@8.4.11

## 3.2.22

### Patch Changes

- Updated dependencies [[`6bc94805af7550967ca675194b5b956284da8797`](https://github.com/vercel/vercel/commit/6bc94805af7550967ca675194b5b956284da8797)]:
  - @vercel/build-utils@8.4.10

## 3.2.21

### Patch Changes

- Updated dependencies [[`dfad4af5c65a565e0afe28731d3918d03d5085b2`](https://github.com/vercel/vercel/commit/dfad4af5c65a565e0afe28731d3918d03d5085b2)]:
  - @vercel/build-utils@8.4.9

## 3.2.20

### Patch Changes

- Updated dependencies [[`226028a8f205a4f795ce8dfdeffc0265cca8d9e2`](https://github.com/vercel/vercel/commit/226028a8f205a4f795ce8dfdeffc0265cca8d9e2)]:
  - @vercel/build-utils@8.4.8

## 3.2.19

### Patch Changes

- Updated dependencies [[`a6227a56d7feec77b5355d2cd5fc07f151021d73`](https://github.com/vercel/vercel/commit/a6227a56d7feec77b5355d2cd5fc07f151021d73), [`e312d610177b28cf1592b18ca85b8d4e088ffc05`](https://github.com/vercel/vercel/commit/e312d610177b28cf1592b18ca85b8d4e088ffc05)]:
  - @vercel/build-utils@8.4.7

## 3.2.18

### Patch Changes

- Updated dependencies [[`5431ffd5de6a572f247e63f737576b4a04884f7b`](https://github.com/vercel/vercel/commit/5431ffd5de6a572f247e63f737576b4a04884f7b)]:
  - @vercel/build-utils@8.4.6

## 3.2.17

### Patch Changes

- Updated dependencies [[`62f434a79fe25009e63fcaefda0abe283c590f58`](https://github.com/vercel/vercel/commit/62f434a79fe25009e63fcaefda0abe283c590f58)]:
  - @vercel/build-utils@8.4.5

## 3.2.16

### Patch Changes

- Updated dependencies [[`2dab096e952c25521bac2537039ed7ca15675095`](https://github.com/vercel/vercel/commit/2dab096e952c25521bac2537039ed7ca15675095)]:
  - @vercel/build-utils@8.4.4

## 3.2.15

### Patch Changes

- Updated dependencies [[`f1904566e5c24919425fc2b6c8c84f25f3478e74`](https://github.com/vercel/vercel/commit/f1904566e5c24919425fc2b6c8c84f25f3478e74)]:
  - @vercel/build-utils@8.4.3

## 3.2.14

### Patch Changes

- Updated dependencies [[`8e90f4156`](https://github.com/vercel/vercel/commit/8e90f415663226411ee6f294e30331a95806e53e)]:
  - @vercel/build-utils@8.4.2

## 3.2.13

### Patch Changes

- Updated dependencies [[`04e15410f`](https://github.com/vercel/vercel/commit/04e15410f09453c528c133d1432fd8b183c5097c)]:
  - @vercel/build-utils@8.4.1

## 3.2.12

### Patch Changes

- Updated dependencies [[`49c95b77a`](https://github.com/vercel/vercel/commit/49c95b77a2cea23c6f98c5e084dbe35d081b40bc)]:
  - @vercel/build-utils@8.4.0

## 3.2.11

### Patch Changes

- Updated dependencies [[`40b7ee0d2`](https://github.com/vercel/vercel/commit/40b7ee0d297c212961279639d9c73d4fed2312f8), [`78a3be23e`](https://github.com/vercel/vercel/commit/78a3be23edff1e59a09a75a8adc2013a5a53fb1d)]:
  - @vercel/build-utils@8.3.9

## 3.2.10

### Patch Changes

- Updated dependencies [[`06337ed0b`](https://github.com/vercel/vercel/commit/06337ed0bb1ab4becd1554642c162c75bdcc91c2), [`2fc9e6d81`](https://github.com/vercel/vercel/commit/2fc9e6d8104a3d6308873ef8dafa27c32f0b97be)]:
  - @vercel/build-utils@8.3.8

## 3.2.9

### Patch Changes

- Updated dependencies [[`c6d469595`](https://github.com/vercel/vercel/commit/c6d469595372d53398c3f2eb35b644a22c56e4f6)]:
  - @vercel/build-utils@8.3.7

## 3.2.8

### Patch Changes

- Updated dependencies [[`bec80e76a`](https://github.com/vercel/vercel/commit/bec80e76afe546072d4138f3ed3d6eda56d3f370)]:
  - @vercel/build-utils@8.3.6

## 3.2.7

### Patch Changes

- Updated dependencies [[`9d9b2fee6`](https://github.com/vercel/vercel/commit/9d9b2fee64b5638a313366ccb3eb2e0b337b4750)]:
  - @vercel/build-utils@8.3.5

## 3.2.6

### Patch Changes

- Updated dependencies [[`ae2bdab65`](https://github.com/vercel/vercel/commit/ae2bdab6544d76687785b40eded0a40e3ea477ff)]:
  - @vercel/build-utils@8.3.4

## 3.2.5

### Patch Changes

- Updated dependencies [[`9290c57b8`](https://github.com/vercel/vercel/commit/9290c57b83cc45a428e4ce96dd4402f97ec7f821)]:
  - @vercel/build-utils@8.3.3

## 3.2.4

### Patch Changes

- Upgrade to @vercel/nft 0.27.3 with a bug fix for browser mapping support ([#11841](https://github.com/vercel/vercel/pull/11841))

## 3.2.3

### Patch Changes

- Updated dependencies [[`3eb40c8c2`](https://github.com/vercel/vercel/commit/3eb40c8c2d205ff3c237774eb0b63135c9298d5d)]:
  - @vercel/build-utils@8.3.2

## 3.2.2

### Patch Changes

- Updated dependencies [[`fc82c3dac`](https://github.com/vercel/vercel/commit/fc82c3dac762c38ee74d6586c9bfe2f402b3fe57)]:
  - @vercel/build-utils@8.3.1

## 3.2.1

### Patch Changes

- Updated dependencies [[`394eddb2a`](https://github.com/vercel/vercel/commit/394eddb2a9f4d9096315fe53f8d27a5401900e5f), [`b9d18c583`](https://github.com/vercel/vercel/commit/b9d18c5835ff16316fafb854eb6447df9c841b98)]:
  - @vercel/build-utils@8.3.0

## 3.2.0

### Minor Changes

- Ignore `shouldAddHelpers` when exporting a server to match production ([#11738](https://github.com/vercel/vercel/pull/11738))

### Patch Changes

- Update undici dep to address vulnerabilities ([#11749](https://github.com/vercel/vercel/pull/11749))

## 3.1.7

### Patch Changes

- Upgrade to @vercel/nft 0.27.2 with browser remapping support ([#11700](https://github.com/vercel/vercel/pull/11700))

- Updated dependencies [[`5c12ed695`](https://github.com/vercel/vercel/commit/5c12ed69500ceff6a9dc544eab0acd7af64c044a), [`21444a38e`](https://github.com/vercel/vercel/commit/21444a38e50ed680c91b0e3955f15e378eeda64b), [`06d2d860e`](https://github.com/vercel/vercel/commit/06d2d860e47aed792247bf929805b180ed6e2dab)]:
  - @vercel/build-utils@8.2.2

## 3.1.6

### Patch Changes

- Updated dependencies [[`83741a0eb`](https://github.com/vercel/vercel/commit/83741a0eb9e44457b083e8790a11eb89984e6357)]:
  - @vercel/build-utils@8.2.1

## 3.1.5

### Patch Changes

- Updated dependencies [[`d3c1267e2`](https://github.com/vercel/vercel/commit/d3c1267e24082789ea6382cf6af81dd40df288ff), [`ccd7eb1fb`](https://github.com/vercel/vercel/commit/ccd7eb1fb78f7ac9effdbe1935de3bda82c97fe3)]:
  - @vercel/build-utils@8.2.0

## 3.1.4

### Patch Changes

- Updated dependencies [[`ad6945435`](https://github.com/vercel/vercel/commit/ad69454352b519b2b0ed326f245c779530554bf2)]:
  - @vercel/build-utils@8.1.3

## 3.1.3

### Patch Changes

- Updated dependencies [[`1682ad43d`](https://github.com/vercel/vercel/commit/1682ad43d0064b22b1248a7e946746b838f00076)]:
  - @vercel/build-utils@8.1.2

## 3.1.2

### Patch Changes

- Updated dependencies [[`2f7a6ed5f`](https://github.com/vercel/vercel/commit/2f7a6ed5f92d454000f92247d3b6548e2064f4e6)]:
  - @vercel/build-utils@8.1.1

## 3.1.1

### Patch Changes

- Bump `@vercel/nft@0.27.0` ([#11580](https://github.com/vercel/vercel/pull/11580))

- Updated dependencies [[`5014b1e82`](https://github.com/vercel/vercel/commit/5014b1e82a46181baeb727ffe6d14000b6a4b1d7)]:
  - @vercel/build-utils@8.1.0

## 3.1.0

### Minor Changes

- Make waitUntil consistent for Node.js & Edge ([#11553](https://github.com/vercel/vercel/pull/11553))

## 3.0.28

### Patch Changes

- Updated dependencies [[`15475c8a2`](https://github.com/vercel/vercel/commit/15475c8a2c303a1dd189ba24044fac750280dd2e), [`21f5e7375`](https://github.com/vercel/vercel/commit/21f5e7375e4cb4ceed98ab56486d09a85fa3894d)]:
  - @vercel/build-utils@8.0.0

## 3.0.27

### Patch Changes

- Updated dependencies [[`2826563ff`](https://github.com/vercel/vercel/commit/2826563ffab7ab01d3c85def2cad8c4041cd88b1)]:
  - @vercel/build-utils@7.12.0

## 3.0.26

### Patch Changes

- Fix issue with serverless function on docker ([#11226](https://github.com/vercel/vercel/pull/11226))

- Add import and require ts-node files for TypeScript in `vc dev` ([#11371](https://github.com/vercel/vercel/pull/11371))

- Updated dependencies [[`73b112b1f`](https://github.com/vercel/vercel/commit/73b112b1f74480e1bb941e1b754105fc7dace401)]:
  - @vercel/build-utils@7.11.0

## 3.0.25

### Patch Changes

- Updated dependencies [[`1825b58df`](https://github.com/vercel/vercel/commit/1825b58df8d783e79f0addf262618f422246f4b3)]:
  - @vercel/build-utils@7.10.0

## 3.0.24

### Patch Changes

- Updated dependencies [[`11218a179`](https://github.com/vercel/vercel/commit/11218a179870a5420c5a6ff720cd4aec4f7e1c5e)]:
  - @vercel/build-utils@7.9.1

## 3.0.23

### Patch Changes

- Updated dependencies [[`8ea93839c`](https://github.com/vercel/vercel/commit/8ea93839ccc70816f3ece9d7cfdb857aa7a4b015)]:
  - @vercel/build-utils@7.9.0

## 3.0.22

### Patch Changes

- Updated dependencies [[`908e7837d`](https://github.com/vercel/vercel/commit/908e7837d55bc02e708f402c700e00208415e954), [`5e3656ec1`](https://github.com/vercel/vercel/commit/5e3656ec1b3f0561091636582715ba09ddd8cb2d)]:
  - @vercel/build-utils@7.8.0

## 3.0.21

### Patch Changes

- Updated dependencies [[`37b193c84`](https://github.com/vercel/vercel/commit/37b193c845d8b63d93bb0017fbc1a6a35306ef1f)]:
  - @vercel/build-utils@7.7.1

## 3.0.20

### Patch Changes

- bump `@vercel/nft@0.26.4` ([#11155](https://github.com/vercel/vercel/pull/11155))

## 3.0.19

### Patch Changes

- build: upgrade edge-runtime ([#11148](https://github.com/vercel/vercel/pull/11148))

- refactor: simplify content-length check ([#11150](https://github.com/vercel/vercel/pull/11150))

- Updated dependencies [[`24c3dd282`](https://github.com/vercel/vercel/commit/24c3dd282d7714cd63d2b94fb94745c45fdc79ab)]:
  - @vercel/build-utils@7.7.0

## 3.0.18

### Patch Changes

- [node][next][redwood][remix] bump `@vercel/nft@0.26.3` ([#11115](https://github.com/vercel/vercel/pull/11115))

- Updated dependencies [[`b6ed28b9b`](https://github.com/vercel/vercel/commit/b6ed28b9b1712f882c93fe053b70d3eb1df21819), [`8ba0ce932`](https://github.com/vercel/vercel/commit/8ba0ce932434c6295fedb5307bee59a804b7e6a8), [`0d034b682`](https://github.com/vercel/vercel/commit/0d034b6820c0f3252949c0ffc483048c5aac7f04), [`abaa700ce`](https://github.com/vercel/vercel/commit/abaa700cea44c723cfc851baa2dfe9e1ae2e8a5c)]:
  - @vercel/build-utils@7.6.0

## 3.0.17

### Patch Changes

- Updated dependencies [[`cdddb33ad`](https://github.com/vercel/vercel/commit/cdddb33ad49f6080c49f4fff3767e6111acd0bbe)]:
  - @vercel/build-utils@7.5.1

## 3.0.16

### Patch Changes

- Deprecate `EdgeFunction#name` property ([#11010](https://github.com/vercel/vercel/pull/11010))

- Updated dependencies [[`98040ec24`](https://github.com/vercel/vercel/commit/98040ec24e1ee585865d11eb216b6525d39d209e)]:
  - @vercel/build-utils@7.5.0

## 3.0.15

### Patch Changes

- Await waitUntil promises to resolve before exiting ([#10915](https://github.com/vercel/vercel/pull/10915))

- [next][node][redwood][remix] Bump `@vercel/nft@0.26.1` ([#11009](https://github.com/vercel/vercel/pull/11009))

## 3.0.14

### Patch Changes

- Updated dependencies [[`67fa2f3dd`](https://github.com/vercel/vercel/commit/67fa2f3dd6a6d5a3504b7f9081e56deff7b36eab)]:
  - @vercel/build-utils@7.4.1

## 3.0.13

### Patch Changes

- Updated dependencies [[`4d63d9e95`](https://github.com/vercel/vercel/commit/4d63d9e954549d811063d259250d1865b7de2ba1)]:
  - @vercel/build-utils@7.4.0

## 3.0.12

### Patch Changes

- Updated dependencies [[`dfe47f6e6`](https://github.com/vercel/vercel/commit/dfe47f6e6c1d395ae24d802f4b7c98e39b9f90f4)]:
  - @vercel/build-utils@7.3.0

## 3.0.11

### Patch Changes

- Updated dependencies [[`88da7463c`](https://github.com/vercel/vercel/commit/88da7463ce12df91d49fbde85cb617030d55f558)]:
  - @vercel/build-utils@7.2.5

## 3.0.10

### Patch Changes

- Updated dependencies [[`65dec5b7e`](https://github.com/vercel/vercel/commit/65dec5b7e752f4da8fe0ffdb25215170453f6f8b)]:
  - @vercel/build-utils@7.2.4

## 3.0.9

### Patch Changes

- Replace usage of `fetch` with `undici.request` ([#10767](https://github.com/vercel/vercel/pull/10767))

## 3.0.8

### Patch Changes

- bump: edge-runtime ([#10712](https://github.com/vercel/vercel/pull/10712))

- Updated dependencies [[`0861dc8fb`](https://github.com/vercel/vercel/commit/0861dc8fbcea1037626b00664a4b6c22f1b0a7ed), [`34dd9c091`](https://github.com/vercel/vercel/commit/34dd9c0918585cf6d3b04bddd9158978b0b4192f)]:
  - @vercel/build-utils@7.2.3
  - @vercel/error-utils@2.0.2

## 3.0.7

### Patch Changes

- Revert "[next][node][redwood][remix] Update @vercel/nft (#10540)" ([#10633](https://github.com/vercel/vercel/pull/10633))

- Update `@vercel/nft` to 0.24.2 ([#10644](https://github.com/vercel/vercel/pull/10644))

- Updated dependencies [[`2f5b0aeeb`](https://github.com/vercel/vercel/commit/2f5b0aeeb183ed3ea8cbc68cb3bc3c949c486ada)]:
  - @vercel/build-utils@7.2.2

## 3.0.6

### Patch Changes

- Use "esbuild" to build package ([#10553](https://github.com/vercel/vercel/pull/10553))

- Update `@vercel/nft` to v0.24.1. ([#10540](https://github.com/vercel/vercel/pull/10540))

- Updated dependencies [[`decdf27fb`](https://github.com/vercel/vercel/commit/decdf27fb5ca914fe50a9320c4fd50ef79d2fbb3)]:
  - @vercel/build-utils@7.2.1

## 3.0.5

### Patch Changes

- [node] upgrade edge-runtime ([#10451](https://github.com/vercel/vercel/pull/10451))

- Updated dependencies [[`50e04dd85`](https://github.com/vercel/vercel/commit/50e04dd8584664c842a86c15d92d654f4ea8dcbb), [`45b73c7e8`](https://github.com/vercel/vercel/commit/45b73c7e86458564dc0bab007f6f6365c4c4ab5d), [`d8bc570f6`](https://github.com/vercel/vercel/commit/d8bc570f604950d97156d4f33c8accecf3b3b28f)]:
  - @vercel/build-utils@7.2.0

## 3.0.4

### Patch Changes

- remove console.log ([#10417](https://github.com/vercel/vercel/pull/10417))

- Updated dependencies [[`5609a1187`](https://github.com/vercel/vercel/commit/5609a1187be9d6cf8d5f16825690c5ea72f17dc5), [`1b4de4a98`](https://github.com/vercel/vercel/commit/1b4de4a986f7a612aac834ebae3ec7bb9e9b8cf8)]:
  - @vercel/build-utils@7.1.1

## 3.0.3

### Patch Changes

- Updated dependencies [[`9e3827c78`](https://github.com/vercel/vercel/commit/9e3827c785e1bc45f2bed421132167381481770f)]:
  - @vercel/build-utils@7.1.0

## 3.0.2

### Patch Changes

- upgrade edge-runtime ([#10385](https://github.com/vercel/vercel/pull/10385))

- use `undici` instead of `node-fetch` ([#10387](https://github.com/vercel/vercel/pull/10387))

## 3.0.1

### Patch Changes

- Updated dependencies [[`96f99c714`](https://github.com/vercel/vercel/commit/96f99c714715651b85eb7a03f58ecc9e1316d156)]:
  - @vercel/error-utils@2.0.1

## 3.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))

### Patch Changes

- Updated dependencies [[`37f5c6270`](https://github.com/vercel/vercel/commit/37f5c6270058336072ca733673ea72dd6c56bd6a)]:
  - @vercel/build-utils@7.0.0
  - @vercel/error-utils@2.0.0
  - @vercel/static-config@3.0.0

## 2.15.10

### Patch Changes

- Update 'edge-runtime' to 2.4.4 ([#10255](https://github.com/vercel/vercel/pull/10255))

- `edge-light` condition interoperability with `vercel dev` ([#10313](https://github.com/vercel/vercel/pull/10313))

## 2.15.9

### Patch Changes

- Updated dependencies [[`a8ecf40d6`](https://github.com/vercel/vercel/commit/a8ecf40d6f50e2fc8b13b02c8ef50b3dcafad3a6)]:
  - @vercel/build-utils@6.8.3

## 2.15.8

### Patch Changes

- Move `@types/content-type` to dev dependency ([#10292](https://github.com/vercel/vercel/pull/10292))

- fix: compress condition ([#10288](https://github.com/vercel/vercel/pull/10288))

## 2.15.7

### Patch Changes

- fix: move content-type as dependency ([#10274](https://github.com/vercel/vercel/pull/10274))

## 2.15.6

### Patch Changes

- [node] fix: runs edge user code inside IIFE ([#10220](https://github.com/vercel/vercel/pull/10220))

## 2.15.5

### Patch Changes

- Updated dependencies [[`0750517af`](https://github.com/vercel/vercel/commit/0750517af99aea41410d4f1f772ce427699554e7)]:
  - @vercel/build-utils@6.8.2

## 2.15.4

### Patch Changes

- [node] fix decompress mismatching ([#10184](https://github.com/vercel/vercel/pull/10184))

- Updated dependencies [[`7021279b2`](https://github.com/vercel/vercel/commit/7021279b284f314a4d1bdbb4306b4c22291efa08)]:
  - @vercel/build-utils@6.8.1

## 2.15.3

### Patch Changes

- Updated dependencies [[`346892210`](https://github.com/vercel/vercel/commit/3468922108f411482a72acd0331f0f2ee52a6d4c)]:
  - @vercel/build-utils@6.8.0

## 2.15.2

### Patch Changes

- add tests to getBodyParser helper ([#10109](https://github.com/vercel/vercel/pull/10109))

- [node] use `undici.Websocket` when is possible ([#10051](https://github.com/vercel/vercel/pull/10051))

## 2.15.1

### Patch Changes

- handle undefined content type in `vc dev` ([#10077](https://github.com/vercel/vercel/pull/10077))

## 2.15.0

### Minor Changes

- Add maxDuration config support for vc node deployments ([#10028](https://github.com/vercel/vercel/pull/10028))

- [node] Add isomorphic functions ([#9947](https://github.com/vercel/vercel/pull/9947))

## 2.14.5

### Patch Changes

- Updated dependencies [[`cd35071f6`](https://github.com/vercel/vercel/commit/cd35071f609d615d47bc04634c123b33768436cb)]:
  - @vercel/build-utils@6.7.5

## 2.14.4

### Patch Changes

- Updated dependencies [[`c7bcea408`](https://github.com/vercel/vercel/commit/c7bcea408131df2d65338e50ce319a6d8e4a8a82)]:
  - @vercel/build-utils@6.7.4

## 2.14.3

### Patch Changes

- Updated dependencies [[`71b9f3a94`](https://github.com/vercel/vercel/commit/71b9f3a94b7922607f8f24bf7b2bd1742e62cc05)]:
  - @vercel/build-utils@6.7.3
