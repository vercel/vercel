## [4.0.15](https://github.com/vuejs/router/compare/v4.0.14...v4.0.15) (2022-05-04)

### Bug Fixes

- **matcher:** keep trailing slash on empty optional params ([2f1e9b9](https://github.com/vuejs/router/commit/2f1e9b976d7c5c1ada38c57f276304688d31b7e4)), closes [#1357](https://github.com/vuejs/router/issues/1357)
- setup history listeners once ([faa8562](https://github.com/vuejs/router/commit/faa85624d37367c638fb9272a4130d8524143120)), closes [#1344](https://github.com/vuejs/router/issues/1344)
- **view:** handle @vue/compat automatically ([92becf6](https://github.com/vuejs/router/commit/92becf6dc6c4ef21985abb52887b4cec626f5c82)), closes [#1315](https://github.com/vuejs/router/issues/1315)

## [4.0.14](https://github.com/vuejs/router/compare/v4.0.13...v4.0.14) (2022-03-10)

### Features

- **devtools:** use api.now() ([06ac7bb](https://github.com/vuejs/router/commit/06ac7bbc4caaacaf8f054aa2ee164517b99b18ba))

## [4.0.13](https://github.com/vuejs/router/compare/v4.0.12...v4.0.13) (2022-02-28)

### Bug Fixes

- **matcher:** add child before parent when using `addRoute` ([8744bba](https://github.com/vuejs/router/commit/8744bbae7789e236e5308f939fb4b2d946a8ca6d))
- **ssr:** reject unfinished initial navigation ([509fc0d](https://github.com/vuejs/router/commit/509fc0d5c78b32cbd5ce0c86f716774ad6163cad)), closes [#1305](https://github.com/vuejs/router/issues/1305)

## [4.0.12](https://github.com/vuejs/router/compare/v4.0.11...v4.0.12) (2021-10-14)

### Bug Fixes

- **history:** ensure base is normalized in memory history ([#1112](https://github.com/vuejs/router/issues/1112)) ([198a5bd](https://github.com/vuejs/router/commit/198a5bda8354ea6c3121f5fbf92ed93390e70cfb))

### Features

- **devtools:** display router view path ([3ce3834](https://github.com/vuejs/router/commit/3ce383402fbaa1539cdfe32cbdd48dfda5fbfa7b)), closes [#1119](https://github.com/vuejs/router/issues/1119)
- **warn:** improve message for onBeforeRoute\*() ([7d5230e](https://github.com/vuejs/router/commit/7d5230e556002b6ddd17c857ad43608590e9a7bd))

## [4.0.11](https://github.com/vuejs/router/compare/v4.0.10...v4.0.11) (2021-08-09)

### Bug Fixes

- **query:** empty object with custom stringify ([4dd2fbf](https://github.com/vuejs/router/commit/4dd2fbfeb486800a7d5fbc384eb567c3c6532f41))
- **router:** allow null | undefined for params ([ebca15a](https://github.com/vuejs/router/commit/ebca15a0140453c6671fdae7a9864badc650531e))
- **router:** invalidate ongoing navigation when unmounting ([d8fb7d0](https://github.com/vuejs/router/commit/d8fb7d0ab1694fe86edbd52668f84fb9bb9f4dcf))
- **types:** Support `undefined` in NavigationGuardNext ([#1059](https://github.com/vuejs/router/issues/1059)) ([6cce232](https://github.com/vuejs/router/commit/6cce232ba0dc5d89f6a53c1af674a8e0c6eb8790))

## [4.0.10](https://github.com/vuejs/router/compare/v4.0.9...v4.0.10) (2021-06-21)

### Features

- **devtools:** display components using `useLink()` ([aab8c04](https://github.com/vuejs/router/commit/aab8c0414af6784fc0250fb4b81be4186ff4cfec)), closes [#1003](https://github.com/vuejs/router/issues/1003)
- **link:** expose useLink on RouterLink as internal ([#1002](https://github.com/vuejs/router/issues/1002)) ([57b1468](https://github.com/vuejs/router/commit/57b1468645248068c76b809efd10f3f42762d52b))

## [4.0.9](https://github.com/vuejs/router/compare/v4.0.8...v4.0.9) (2021-06-16)

### Bug Fixes

- **guards:** propagate lazy loading rejections ([3d465cc](https://github.com/vuejs/router/commit/3d465cc128b2f5c109e71386760c7b99e3d71bce))
- **hash:** force navigation restore on manual navigation ([#921](https://github.com/vuejs/router/issues/921)) ([e08a0d0](https://github.com/vuejs/router/commit/e08a0d0b64d2798164895da430de7edbb66d7ead)), closes [#916](https://github.com/vuejs/router/issues/916)
- **link:** catch errors ([e7b2156](https://github.com/vuejs/router/commit/e7b2156c7436f18d1a08694f502eb00b10029f1c))
- **query:** allow arbitrary keys in queries ([a57b5f1](https://github.com/vuejs/router/commit/a57b5f179b8859776550f3b754f972fad8955566)), closes [#880](https://github.com/vuejs/router/issues/880)
- **warn:** drop unused params on string redirect ([bed24df](https://github.com/vuejs/router/commit/bed24dff90c19a0ee3e335dbe43ed9ddbfc74542)), closes [#951](https://github.com/vuejs/router/issues/951)

### Features

- **devtools:** group navigation errors ([a776a84](https://github.com/vuejs/router/commit/a776a8402b7ae5bdc017409f26d4574bcee4858b))
- **errors:** add to and from to router.onError()` ([c76feab](https://github.com/vuejs/router/commit/c76feabf3703f06bff400d7aa84edede48329b82))
- **errors:** log errors when no error handlers ([46a354e](https://github.com/vuejs/router/commit/46a354ec5b9359bb1dcd3ac82716e898b3843ae4))

## [4.0.8](https://github.com/vuejs/router/compare/v4.0.6...v4.0.8) (2021-05-13)

This release is a correct tag and doesn't contain any extra changes.

## [4.0.7](https://github.com/vuejs/router/compare/v4.0.6...v4.0.7) (2021-05-13)

### Bug Fixes

- **$route:** Make $route have an enumerable type ([#912](https://github.com/vuejs/router/issues/912)) ([d90520e](https://github.com/vuejs/router/commit/d90520eb36ca310f52b22caeb88fd8cb06dca04a))
- **devtools:** stabilize record id ([#897](https://github.com/vuejs/router/issues/897)) ([c6460f0](https://github.com/vuejs/router/commit/c6460f09aab3a834121dc58fc5880c81a65147ef))
- **history:** make properties enumerable ([8e6ebdf](https://github.com/vuejs/router/commit/8e6ebdf75adc1ab662e46835c5b7f078bc68a93b))
- **history:** proper destroy in memory history ([9d188aa](https://github.com/vuejs/router/commit/9d188aa165aeb12aa3771aaa56a269f5dad3ccf6))
- **query:** filter undefined values in arrays ([df25fb5](https://github.com/vuejs/router/commit/df25fb5c34ae4a1540d375ad078705719b56332b))
- **query:** prevent trailing & in query ([#935](https://github.com/vuejs/router/issues/935)) ([885bb06](https://github.com/vuejs/router/commit/885bb06bb590944f2e58176151f7b7a6acbc1b4e))
- do not allow invalid hazardous keys in query ([#880](https://github.com/vuejs/router/issues/880)) ([ecd52e0](https://github.com/vuejs/router/commit/ecd52e017ac30fa996d4796974371374f65640d1))

## [4.0.6](https://github.com/vuejs/router/compare/v4.0.5...v4.0.6) (2021-04-06)

### Bug Fixes

- **link:** let vue merge attrs ([4142871](https://github.com/vuejs/router/commit/4142871189dbb13e1ce2d6be8d82bd5aa27526a3)), closes [#846](https://github.com/vuejs/router/issues/846)
- **link:** use flush post in devtools watcher ([4108814](https://github.com/vuejs/router/commit/41088143c62244fe7b198e0907f4f6f98852df62)), closes [#845](https://github.com/vuejs/router/issues/845)

### Features

- **types:** allow currentLocation param in resolve ([add6ce9](https://github.com/vuejs/router/commit/add6ce9677ffd2c636e215ffab5ddbdef22b0158))
- **warn:** throws if history is missing ([#844](https://github.com/vuejs/router/issues/844)) ([dd8bf6c](https://github.com/vuejs/router/commit/dd8bf6cf48db352cef72f419a14d1540818eb6ff))

## [4.0.5](https://github.com/vuejs/router/compare/v4.0.4...v4.0.5) (2021-03-11)

### Bug Fixes

- **guards:** avoid enter guards between aliases ([0048b9b](https://github.com/vuejs/router/commit/0048b9b1b0fd0a0652fdabb683309fc5c0d5dbe4))
- **guards:** ensure beforeRouteUpdate works with aliases ([#819](https://github.com/vuejs/router/issues/819)) ([45ecb20](https://github.com/vuejs/router/commit/45ecb205920be60c9b454dbb55cf4fe213bbc697)), closes [#805](https://github.com/vuejs/router/issues/805)
- **view:** correctly reuse instance guards ([#795](https://github.com/vuejs/router/issues/795)) ([d4fde59](https://github.com/vuejs/router/commit/d4fde599803a1be9d4823de0e406c9ce66143e2c))

### Features

- **devtools:** group navigations ([d3b5dfb](https://github.com/vuejs/router/commit/d3b5dfb6d8a3da96ee93426dc4b5429581e8a739))

## [4.0.4](https://github.com/vuejs/router/compare/v4.0.3...v4.0.4) (2021-02-19)

### Bug Fixes

- **devtools:** id and label ([#742](https://github.com/vuejs/router/issues/742)) ([d034307](https://github.com/vuejs/router/commit/d034307444860fb834b0f5b5a1ddd0cce9d6d842))
- **guards:** vue-class-component call guards on first... ([#755](https://github.com/vuejs/router/issues/755)) ([06f942d](https://github.com/vuejs/router/commit/06f942d0fbe1c5c86dc7e17d38c00d595854bd4f))
- **matcher:** force leading slash with optional param in multi segments ([11c882f](https://github.com/vuejs/router/commit/11c882f8f3b56d2c87fc095c46eb8050fbbf61df))
- **warn:** should not warn missing optional params in aliases ([92f8901](https://github.com/vuejs/router/commit/92f8901f54775cb4b3d1f2415b6a2b3ff77eb440))

### Features

- **types:** make meta type safe with unknown ([eef0472](https://github.com/vuejs/router/commit/eef0472e3589ed0a6df0528a7b96f1d7bf316843))

## [4.0.3](https://github.com/vuejs/router/compare/v4.0.2...v4.0.3) (2021-01-11)

### Bug Fixes

- **hash:** allow base tag different from base parameter ([85b1bff](https://github.com/vuejs/router/commit/85b1bff96fbb6e21cd556b688f6085b6fbfe993f)), closes [#685](https://github.com/vuejs/router/issues/685)
- **link:** use replace prop ([6edba5c](https://github.com/vuejs/router/commit/6edba5cf676bde94e5ebdb370a4146dc8f6b058e)), closes [#702](https://github.com/vuejs/router/issues/702)

### Features

- **types:** expose RouteParamsRaw ([09bbc89](https://github.com/vuejs/router/commit/09bbc895cd422af8354664062b29131ae32472d7))
- **warn:** more specific warnings ([2cd8d86](https://github.com/vuejs/router/commit/2cd8d867beda6f7c54578d40934774547866e069))
- **warn:** warn defineAsyncComponent usage in routes ([#682](https://github.com/vuejs/router/issues/682)) ([9520d66](https://github.com/vuejs/router/commit/9520d66112c0f2922f4284cda1e75b316ddf3488))

## [4.0.2](https://github.com/vuejs/router/compare/v4.0.1...v4.0.2) (2020-12-27)

### Bug Fixes

- **matcher:** clear customRe after consuming buffer ([#680](https://github.com/vuejs/router/issues/680)) ([4c0b825](https://github.com/vuejs/router/commit/4c0b82507e1f949d55daffd06756615cd704e090)), closes [#679](https://github.com/vuejs/router/issues/679)
- **router:** allow replace to have query and hash ([6a8ccb6](https://github.com/vuejs/router/commit/6a8ccb6e3b80aef00dda7e73be2afb433d871a32)), closes [#668](https://github.com/vuejs/router/issues/668)
- **router:** do not restore history when ... ([db267be](https://github.com/vuejs/router/commit/db267be72bace7c99a0c65669ab04ce770e1532c)), closes [#662](https://github.com/vuejs/router/issues/662)
- **router-view:** disable inheritAttrs ([1e58574](https://github.com/vuejs/router/commit/1e58574e6175f591f7fb24bcfc6e11045e7b0148)), closes [#674](https://github.com/vuejs/router/issues/674)
- **types:** add missing exported types ([034c71c](https://github.com/vuejs/router/commit/034c71c72ca46d242daf53ae54ab67e6f7800f91))
- spread operator compatible ([a2f3e91](https://github.com/vuejs/router/commit/a2f3e91cb3e3ae61118d803ce938d6f4eea76116))

## [4.0.1](https://github.com/vuejs/router/compare/v4.0.0...v4.0.1) (2020-12-07)

### Bug Fixes

- **build:** rollback rollup plugin commonjs ([9486950](https://github.com/vuejs/router/commit/9486950f3399bda34ab2840b83fd123ac5ce7ce9))

# [4.0.0](https://github.com/vuejs/router/compare/v4.0.0-rc.6...v4.0.0) (2020-12-07)

### Bug Fixes

- **router-view:** properly use route prop when nested ([b74051a](https://github.com/vuejs/router/commit/b74051a6bde7524d1a7cc6cc1daacb213987faa0))
- **router-view:** return one node when possible ([d18e500](https://github.com/vuejs/router/commit/d18e500da2ed017be30871628a5cc59324bec15c)), closes [#537](https://github.com/vuejs/router/issues/537)

### Features

- expose routerViewLocationKey as internal ([f498646](https://github.com/vuejs/router/commit/f498646c3bc2ad480be7a3d0f11aa11710729911))

# [4.0.0-rc.6](https://github.com/vuejs/router/compare/v4.0.0-rc.5...v4.0.0-rc.6) (2020-11-30)

### Bug Fixes

- **guards:** correctly reuse guards ([#616](https://github.com/vuejs/router/issues/616)) ([95d44c8](https://github.com/vuejs/router/commit/95d44c8ff2a961e052fd67b2160b87fb32d0ffb4)), closes [#614](https://github.com/vuejs/router/issues/614)

### Features

- **devtools:** improve active + match in routes inspector ([9f59489](https://github.com/vuejs/router/commit/9f59489f04cedfca5ba55da019b2dc790e926fd7))
- **types:** expose `LocationQueryValueRaw` as internal ([dc02850](https://github.com/vuejs/router/commit/dc028500c3e931ed5fd6beedf58b5425f5115b52))

# [4.0.0-rc.5](https://github.com/vuejs/router/compare/v4.0.0-rc.4...v4.0.0-rc.5) (2020-11-21)

### Features

- **scroll:** allow modifying scrollBehavior in options ([#602](https://github.com/vuejs/router/issues/602)) ([d6651f5](https://github.com/vuejs/router/commit/d6651f5f954c8ecaf1a77ec209d5aba06343e867))

# [4.0.0-rc.4](https://github.com/vuejs/router/compare/v4.0.0-rc.3...v4.0.0-rc.4) (2020-11-20)

### Features

- expose symbols as internals ([ef62d96](https://github.com/vuejs/router/commit/ef62d9645c456f069699480ae3f2c3dd97b9d30d))

# [4.0.0-rc.3](https://github.com/vuejs/router/compare/v4.0.0-rc.2...v4.0.0-rc.3) (2020-11-14)

### Bug Fixes

- trigger redirect on popstate ([#592](https://github.com/vuejs/router/issues/592)) ([18dbdc2](https://github.com/vuejs/router/commit/18dbdc2745cf7bd2516d4576a8d6a21de78516ec))
- **query:** encode space as + ([4d3dd5f](https://github.com/vuejs/router/commit/4d3dd5fd523cefc675aa7e61ed9b06b66e42b80c)), closes [#561](https://github.com/vuejs/router/issues/561)

# [4.0.0-rc.2](https://github.com/vuejs/router/compare/v4.0.0-rc.1...v4.0.0-rc.2) (2020-11-05)

### Features

- expose injection symbols as internals ([0056aca](https://github.com/vuejs/router/commit/0056aca5b251df2a18bab79e18874a18e0204b4d))
- **devtools:** add devtools plugin ([894d50d](https://github.com/vuejs/router/commit/894d50d351a40df95a3227840f5485f7e8b90432))
- **devtools:** add more ([ee07302](https://github.com/vuejs/router/commit/ee0730254522d6162114968e4d62b93e8b6f7f93))
- **devtools:** better search ([5d68a29](https://github.com/vuejs/router/commit/5d68a29386f34363b38c4138fbeae01ec538285e))
- **devtools:** support multiple router instances ([2e5d0d4](https://github.com/vuejs/router/commit/2e5d0d4d726ee6329745f34ca463a74820c5aa29))

# [4.0.0-rc.1](https://github.com/vuejs/router/compare/v4.0.0-beta.13...v4.0.0-rc.1) (2020-10-23)

### Features

- **warn:** improve warning for invalid components ([5985b65](https://github.com/vuejs/router/commit/5985b6560d40412d67311df10343ee6a119a0535)), closes [#517](https://github.com/vuejs/router/issues/517)

# [4.0.0-beta.13](https://github.com/vuejs/router/compare/v4.0.0-beta.12...v4.0.0-beta.13) (2020-10-02)

### Bug Fixes

- **encoding:** decode hash in string location ([11acb3d](https://github.com/vuejs/router/commit/11acb3dea072592f00a23b912d39c3fcf72dc6c3))
- **encoding:** differentiate keys and values in query ([a967e42](https://github.com/vuejs/router/commit/a967e427ab3bc5c1e6236b01f484a87b74a92be1))
- **encoding:** keep decoded hash when resolving ([1a8ffc1](https://github.com/vuejs/router/commit/1a8ffc19b0d2bfc17daec4cb04b96d174c73dd9d))
- **hash:** only pushState the hash part ([2a14c19](https://github.com/vuejs/router/commit/2a14c19e4f0313996fd075a6821f85d30c5cad66)), closes [#495](https://github.com/vuejs/router/issues/495)

### Features

- **warn:** help migrating catch all routes ([14e1eb9](https://github.com/vuejs/router/commit/14e1eb96485f74669f582a87f522d3b13b567c9c))
- print errors from lazy loading ([f6db91a](https://github.com/vuejs/router/commit/f6db91aaf496b85c80e74727575cc1c2b1d06282)), closes [#497](https://github.com/vuejs/router/issues/497)

# [4.0.0-beta.12](https://github.com/vuejs/router/compare/v4.0.0-beta.11...v4.0.0-beta.12) (2020-09-25)

### Bug Fixes

- **types:** extend @vue/runtime-core module ([#473](https://github.com/vuejs/router/issues/473)) ([556cd4b](https://github.com/vuejs/router/commit/556cd4b4af3d7ac1aa1c66848f5ab1bc33d13153))

# [4.0.0-beta.11](https://github.com/vuejs/router/compare/v4.0.0-beta.10...v4.0.0-beta.11) (2020-09-20)

### Bug Fixes

- use post flush in modal example ([2024281](https://github.com/vuejs/router/commit/2024281902d62454d9159c87d4288d691cd0bce8))
- **guards:** use post watcher for instances ([3234c59](https://github.com/vuejs/router/commit/3234c5924f39fd9497866bfd160407256dc91bfe))

# [4.0.0-beta.10](https://github.com/vuejs/router/compare/v4.0.0-beta.9...v4.0.0-beta.10) (2020-09-18)

### Bug Fixes

- **history:** gracefully handle empty state ([cbcf2a9](https://github.com/vuejs/router/commit/cbcf2a95a2af001c8aea96f3c76c4c4ef139219f)), closes [#366](https://github.com/vuejs/router/issues/366)
- **types:** better type for navigate ([0384cb0](https://github.com/vuejs/router/commit/0384cb062d50f6be37512410b4c2d170896dc9cb))
- **types:** explicit types on navigate ([36d218c](https://github.com/vuejs/router/commit/36d218c15268d0d3d15d4ed3adc75c8cb09ed68b))
- **types:** fix types for redirect records ([a77f148](https://github.com/vuejs/router/commit/a77f1485323ef3b654077ecb227fd5a0373d3a2f))
- **warn:** correctly warn against unused next ([47cd7b9](https://github.com/vuejs/router/commit/47cd7b97bb7a3999178a26a4ca1af955178ea5d6))

### Code Refactoring

- **types:** Rename ScrollBehavior to RouterScrollBehavior ([9fc0996](https://github.com/vuejs/router/commit/9fc09969db854bc0201454fbecd546637b76213a))

### Features

- **router:** remove partial Promise from router.go ([6ed6eee](https://github.com/vuejs/router/commit/6ed6eee38b59eb0b6dec0bcb7d73e24203e20ba4))
- **types:** allow extending meta fields ([#407](https://github.com/vuejs/router/issues/407)) ([706e84f](https://github.com/vuejs/router/commit/706e84f0099a2a04485dfa98449fdc875442bb49))
- **warn:** point to scrollBehavior in message ([70ce7fe](https://github.com/vuejs/router/commit/70ce7feefac3fddd2a9641fcc2ccc66b4b108775))

### BREAKING CHANGES

- **router:** The `router.go()` methods doesn't return anything
  (like in Vue Router 3) anymore. The existing implementation was wrong as it
  would resolve the promise for the following navigation if `router.go()`
  was called with something that wasn't possible e.g. `router.go(-20)`
  right after entering the application would not do anything. Even worse,
  the promise returned by that call would resolve **after the next
  navigation**. There is no proper native API to implement this
  promise-based api properly, but one can write a version that should work
  in most scenarios by setting up multiple hooks right before calling
  `router.go()`:

```js
export function go(delta) {
  return new Promise((resolve, reject) => {
    function popStateListener() {
      clearTimeout(timeout)
    }
    window.addEventListener('popstate', popStateListener)

    function clearHooks() {
      removeAfterEach()
      removeOnError()
      window.removeEventListener('popstate', popStateListener)
    }

    // if the popstate event is not called, consider this a failure
    const timeout = setTimeout(() => {
      clearHooks()
      reject(new Error('Failed to use router.go()'))
      // It's unclear of what value would always work here
    }, 10)

    setImmediate

    const removeAfterEach = router.afterEach((_to, _from, failure) => {
      clearHooks()
      resolve(failure)
    })
    const removeOnError = router.onError(err => {
      clearHooks()
      reject(err)
    })

    router.go(delta)
  })
}
```

- **types:** there is already an existing type named `ScrollBehavior`,
  so we are renaming our type to avoid any confusions and allow the user
  to use both types at the same type (which given what the existing
  `ScrollBehavior` type is designed for, will likely happen).

# [4.0.0-beta.9](https://github.com/vuejs/router/compare/v4.0.0-beta.8...v4.0.0-beta.9) (2020-09-01)

Build related fixes

# [4.0.0-beta.8](https://github.com/vuejs/router/compare/v4.0.0-beta.7...v4.0.0-beta.8) (2020-09-01)

### Bug Fixes

- **router-view:** reuse saved instances in different records ([#446](https://github.com/vuejs/router/issues/446)) ([6554171](https://github.com/vuejs/router/commit/65541718b0d5af665fd87dc0e48770cba832a2bb))
- **types:** add HTML attributes for JSX ([06f3f8f](https://github.com/vuejs/router/commit/06f3f8fd7c3a32da331802fe5d3d19ced17200a3)), closes [#435](https://github.com/vuejs/router/issues/435)
- **types:** allow components defined via defineComponent ([#421](https://github.com/vuejs/router/issues/421)) ([e47c84c](https://github.com/vuejs/router/commit/e47c84c74a97ae7bb9095ea75f98a6fa8a216532))

### BREAKING CHANGES

- **router-view:** `onBeforeRouteLeave` and `onBeforeRouteUpdate` used to
  have access to the component instance through `instance.proxy` but given
  that:
  1. It has been marked as `internal` (https://github.com/vuejs/vue-next/pull/1849)
  2. When using `setup`, all variables are accessible on the scope (and
     should be accessed that way because the code minimizes better)
     It has been removed to prevent wrong usage and lighten Vue Router

# [4.0.0-beta.7](https://github.com/vuejs/router/compare/v4.0.0-beta.6...v4.0.0-beta.7) (2020-08-19)

### Bug Fixes

- **encoding:** encode partial params ([eb04117](https://github.com/vuejs/router/commit/eb041175c02ab0dac093823574a85bbbbf2056eb))
- **matcher:** avoid trailing slash with optional params ([faf0aab](https://github.com/vuejs/router/commit/faf0aab6451848e5b4330e1d01033137a0c42a5a))
- **types:** append declare module ([50ad404](https://github.com/vuejs/router/commit/50ad404ae45086f051b01ac552e4a3ab98535633)), closes [#419](https://github.com/vuejs/router/issues/419)
- **vetur:** update tags/attributes definition ([#408](https://github.com/vuejs/router/issues/408)) ([df8b2b1](https://github.com/vuejs/router/commit/df8b2b140155d1e4ad5d00cd17d57ab2046a75e2))

### Features

- **warn:** warn against infinite redirections ([e3dcc8d](https://github.com/vuejs/router/commit/e3dcc8d9477e17f9b92e22787b750edc4658b77a))

# [4.0.0-beta.6](https://github.com/vuejs/router/compare/v4.0.0-beta.5...v4.0.0-beta.6) (2020-08-05)

### Bug Fixes

- **router:** stack overflow with redirect ([3594011](https://github.com/vuejs/router/commit/359401107078348f0410abbd36cffb3b8d4d8f85)), closes [#404](https://github.com/vuejs/router/issues/404)

### Features

- **router-link:** add ariaCurrentValue prop ([23e6e9c](https://github.com/vuejs/router/commit/23e6e9c10b4f9cb9f074ebb4f56d2d99acac9097))
- add Vetur support ([1f1189f](https://github.com/vuejs/router/commit/1f1189fd23dc6ec318edd5d7e8f225b467d4d386)), closes [#381](https://github.com/vuejs/router/issues/381)

# [4.0.0-beta.5](https://github.com/vuejs/router/compare/v4.0.0-beta.4...v4.0.0-beta.5) (2020-08-03)

### Features

- resolve simple relative links ([af1deaa](https://github.com/vuejs/router/commit/af1deaab5e0fd1597a7cf7ee9a6d01cac507970d))
- **url:** simple resolve relative location ([69c44db](https://github.com/vuejs/router/commit/69c44db3fd5363a833675b4b0ef14f97ac691af6))
- **warn:** warn if guard returns without calling next ([6e16bdd](https://github.com/vuejs/router/commit/6e16bdd6338ea3b7da1f8a0b3000ec880be840d6))

# [4.0.0-beta.4](https://github.com/vuejs/router/compare/v4.0.0-beta.3...v4.0.0-beta.4) (2020-07-25)

### Bug Fixes

- **router-view:** render the slot when there is no match ([bae42d4](https://github.com/vuejs/router/commit/bae42d41c2240947e5b649e568cad274214c6346)), closes [#385](https://github.com/vuejs/router/issues/385)
- work on Edge by adding an argument to catch ([#383](https://github.com/vuejs/router/issues/383)) ([9580bea](https://github.com/vuejs/router/commit/9580bead1f03f1be95473e965daa1f1ee78921f3))

# [4.0.0-beta.3](https://github.com/vuejs/router/compare/v4.0.0-beta.2...v4.0.0-beta.3) (2020-07-21)

### Bug Fixes

- **guards:** call beforeRouteEnter once per named view ([f2846ff](https://github.com/vuejs/router/commit/f2846ff2a0796e58a9b04593909f7a30b7b68bb1))
- **guards:** remove registered update guards after leaving ([41bffda](https://github.com/vuejs/router/commit/41bffda49c24d560cfe555aa88bcebbbd1d03d68))
- **guards:** skip update and leave guards of unmounted views ([f22e70a](https://github.com/vuejs/router/commit/f22e70a6d15ce9834c9eb841d9fe9547c5d21e24))
- **hash:** allow url to contain search params before hash ([ae8b289](https://github.com/vuejs/router/commit/ae8b28934b1c9a092174ebd6fb5aa10aefe1de44)), closes [#378](https://github.com/vuejs/router/issues/378)

### Features

- **errors:** export isNavigationFailure ([28a9b25](https://github.com/vuejs/router/commit/28a9b25d976c325d3193cada8034a6e42297e665))
- **guards:** allow guards to return a value instead of calling next ([#343](https://github.com/vuejs/router/issues/343)) ([5cb209f](https://github.com/vuejs/router/commit/5cb209f3bb53ac0ddf62152f695da610facf4724))
- **guards:** wip context support in multi apps ([34d7390](https://github.com/vuejs/router/commit/34d7390b946644a128ab6fd03fd821a91fd4782c))

# [4.0.0-beta.2](https://github.com/vuejs/router/compare/v4.0.0-beta.1...v4.0.0-beta.2) (2020-07-07)

Fix build cache issues

# [4.0.0-beta.1](https://github.com/vuejs/router/compare/v4.0.0-alpha.14...v4.0.0-beta.1) (2020-07-03)

### Bug Fixes

- **hash:** manual changes should trigger a navigation ([93891ab](https://github.com/vuejs/router/commit/93891abf02fc24d66c6f43926a28f275560fb714)), closes [#346](https://github.com/vuejs/router/issues/346)
- **router-link:** add missing prop custom in jsx ([c6274ae](https://github.com/vuejs/router/commit/c6274aeaf5ad4ba4f97c82aad3e1819ef20f5d69))
- **router-view:** preserve keep-alive route guard this context ([#344](https://github.com/vuejs/router/issues/344)) ([994c073](https://github.com/vuejs/router/commit/994c073fd90add30bf16b5268332277f8b082a74))
- **warn:** warn when RouterView is wrapped with transition ([e4b3fbe](https://github.com/vuejs/router/commit/e4b3fbe8b799b6621537afe365267a18eab9d3cd))

### Code Refactoring

- **history:** simplify location as a string ([10a071c](https://github.com/vuejs/router/commit/10a071c85c62b6674929162aa36220bd8c167f27))
- **router:** remove history property ([aba3a3f](https://github.com/vuejs/router/commit/aba3a3f3a0d860f76d75938ae09616a329c7c13c))

### Features

- **guards:** next callback beforeRouteEnter ([d9dad0b](https://github.com/vuejs/router/commit/d9dad0b9467fee9478406899043ee35f30cdf1fb))

### BREAKING CHANGES

- **router:** the history property was marked as internal already. Since we
  need to pass the history instance to the router, we always have access to it,
  differently from Vue Router 3 where the history was instantiated internally.
  The history API was also internal (it wasn't documented), so this change
  shouldn't be a problem as people shouldn't be relying on `router.history` in
  their apps. If you think this property is needed, please open an issue to
  discuss the use case. Note it's already accessible as you have to create it:

```js
export const history = createWebHistory()
export const router = createRouter({ history, routes: [] })
```

- **history:** HistoryLocation is just a string now. It was pretty much an
  internal property but it could be used inside `history.state`. It used to be an
  object `{ fullPath: '/the-url' }`. And it's now just the `fullPath` property.

# [4.0.0-alpha.14](https://github.com/vuejs/router/compare/v4.0.0-alpha.13...v4.0.0-alpha.14) (2020-07-01)

### Bug Fixes

- **hash:** use relative links in hash mode ([32c9590](https://github.com/vuejs/router/commit/32c9590db89e69c8f7c61905a5eaf19df2054e42)), closes [#342](https://github.com/vuejs/router/issues/342)
- **query:** do not normalize query with custom stringifyQuery ([ea65066](https://github.com/vuejs/router/commit/ea65066e8511d8320ad8de37b32ea9a8028fa9d5)), closes [#328](https://github.com/vuejs/router/issues/328)
- **query:** isSameRouteLocation compares queries by string ([6e1f0ea](https://github.com/vuejs/router/commit/6e1f0eacf60c7e3d465dd0af68f79dc649269b17)), closes [#328](https://github.com/vuejs/router/issues/328)

### Features

- **redirect:** allow redirect on routes witch children ([e57b875](https://github.com/vuejs/router/commit/e57b875dd9d375778a847627434803f4ec79a818))
- **router:** support multiple apps at the same time ([565ec9d](https://github.com/vuejs/router/commit/565ec9d489b4aad347ee466b781ca85aff76bf2d))

# [4.0.0-alpha.13](https://github.com/vuejs/router/compare/v4.0.0-alpha.12...v4.0.0-alpha.13) (2020-06-18)

### Bug Fixes

- allow arbitrary selectors starting with # ([14b859d](https://github.com/vuejs/router/commit/14b859dfa6fa5ccefe42c6f834ddd24dd9921a1b))
- use assign to align with Vue browser support ([#311](https://github.com/vuejs/router/issues/311)) ([f80b670](https://github.com/vuejs/router/commit/f80b670d4dac30323221fcb2f93137ffd874c51b)), closes [#304](https://github.com/vuejs/router/issues/304)
- **hash:** use location.pathname ([0078147](https://github.com/vuejs/router/commit/007814745dd98bb8cfa53f44d5c308193b2fbb60)), closes [#261](https://github.com/vuejs/router/issues/261)
- **matcher:** correct check when removing existing records on add ([2c267f5](https://github.com/vuejs/router/commit/2c267f5aceec899c84514571e4fa75dc61441ed4))
- **matcher:** override records by name when adding ([07100fc](https://github.com/vuejs/router/commit/07100fc1386fb636da3eb1c8196a36f6538eb91f))
- **scroll:** avoid reusing scroll position ([dfc1fb3](https://github.com/vuejs/router/commit/dfc1fb34a761138a3390ccd5a8a042863018222a))

### Features

- **scroll:** allow passing behavior option ([12e9209](https://github.com/vuejs/router/commit/12e92094df46129ddf75d0fa8e3d9816644200de))
- **scroll:** replace selector with el ([ab8a01c](https://github.com/vuejs/router/commit/ab8a01c0a6eda1bafc293b39cb6c77ed10fb359e))
- **warn:** warn if component is a promise ([4b2bfa8](https://github.com/vuejs/router/commit/4b2bfa80cd3440441d71e690ca85d0532a4b8428))
- **warn:** warn when routes are not found ([#279](https://github.com/vuejs/router/issues/279)) ([d125356](https://github.com/vuejs/router/commit/d125356e0f67f906f5f602f0b485f9e1e4f5bf51))
- allow props for named views ([dbe2344](https://github.com/vuejs/router/commit/dbe2344af5fed39aa4aa8fbfe48b195580d9538b))
- **warn:** warn multiple params with same name ([5c8cd6e](https://github.com/vuejs/router/commit/5c8cd6e8ae1223e9871252cc617b19424f01c5c2))

### BREAKING CHANGES

- **scroll:** this change follows the RFC at
  https://github.com/vuejs/rfcs/pull/176:

* `selector` is renamed into `el`
* `el` also accepts an `Element`
* `left` and `top` are passed along `el` instead of inside an object
  passed as `offset`

- **scroll:** `scrollBehavior` doesn't accept an object with `x` and `y`
  coordinates anymore. Instead it accepts an object like
  [`ScrollToOptions`](https://developer.mozilla.org/en-US/docs/Web/API/ScrollToOptions)
  with `left` and `top` properties. You can now also pass the
  [`behavior`](https://developer.mozilla.org/en-US/docs/Web/API/ScrollToOptions/behavior)
  property to enable smooth scrolling in most browsers.
- It is now necessary to escape id selectors like
  explained at https://mathiasbynens.be/notes/css-escapes. This was
  necessary to allow selectors like `#container > child`.

# [4.0.0-alpha.12](https://github.com/vuejs/router/compare/v4.0.0-alpha.11...v4.0.0-alpha.12) (2020-05-19)

### Bug Fixes

- **hash:** allow base with non trailing slash ([f5cc050](https://github.com/vuejs/router/commit/f5cc0505f9e0cc30ff94e362ceb24d300afd684d)), closes [#247](https://github.com/vuejs/router/issues/247)
- prevent error on initial navigation to //invalid ([e72e4ba](https://github.com/vuejs/router/commit/e72e4ba1cc7b80aa44d3958db259d9e3a351d0fd))

### Features

- **warn:** warn multiple leading slashes ([87c5e53](https://github.com/vuejs/router/commit/87c5e53b43c218c83f9db986ac7538d74525ea5b))

### BREAKING CHANGES

- **hash:** When providing a base for hash histories, it is now necessary
  to include a trailing slash to create a url that starts with `/#/`, otherwise it
  will result in a url starting with `#/`. This allows users to use the routing
  system directly in simple files without needing to configure a server at all:
  - `https://example.com/file.html` + `base: 'file.html` will produce a final
    url of `https://example.com/file.html#/`
  - `https://example.com/folder` + `base: 'folder` will produce a final url of
    `https://example.com/folder#/`
  - `https://example.com/folder` + `base: 'folder/` will produce a final url of
    `https://example.com/folder/#/`

# [4.0.0-alpha.11](https://github.com/vuejs/router/compare/v4.0.0-alpha.10...v4.0.0-alpha.11) (2020-05-12)

### Bug Fixes

- **scroll:** change scrollRestoration if scrollBehavior is provided ([5cf2e61](https://github.com/vuejs/router/commit/5cf2e611de2477e92699121573cb162ff98a7b8d))
- match base in a non-sensitive way ([7087bbc](https://github.com/vuejs/router/commit/7087bbc9c479f2955381d8a823a3ef8f9eed7b5a))
- **router:** allow multiple router instance ([24d3d49](https://github.com/vuejs/router/commit/24d3d49babcdea751f4c4e7e9a87625f8744a122))
- **router:** unique first navigation with multi app ([33172af](https://github.com/vuejs/router/commit/33172aff03b7c302699753a8abe5750094bdde26))

### Features

- **types:** export NavigationGuardNext ([#229](https://github.com/vuejs/router/issues/229)) ([888bf4d](https://github.com/vuejs/router/commit/888bf4df33d718d74e5835e99d0f1ac4ce3a0ccf))
- explicit injection symbols in dev mode ([#228](https://github.com/vuejs/router/issues/228)) ([fab88ee](https://github.com/vuejs/router/commit/fab88ee261c49b739545918deab583757aab561e))
- support jsx and tsx for RouterLink and RouterView ([1d3dce3](https://github.com/vuejs/router/commit/1d3dce3106af700fc95a403f1c229644fe8d85b8)), closes [#226](https://github.com/vuejs/router/issues/226)
- **router:** allow functional components for routes ([096d864](https://github.com/vuejs/router/commit/096d86498e954345c6bd4d8e82fe54c37d3f869b))
- **scroll:** scroll to the same location like regular links ([5f22d4f](https://github.com/vuejs/router/commit/5f22d4fa39171906802cc20ada00ec57bdfce880))
- **warn:** warn if next was called multiple times ([dce2612](https://github.com/vuejs/router/commit/dce2612e495b1d5789cd993a54d24599967a8cf4))

# [4.0.0-alpha.10](https://github.com/vuejs/router/compare/v4.0.0-alpha.9...v4.0.0-alpha.10) (2020-05-05)

### Bug Fixes

- **scroll:** do not restore on push ([3f79195](https://github.com/vuejs/router/commit/3f7919585117048c379b6dee8af1cc1de5996af0))

### Features

- **warn:** warn invalid hash ([fcf2365](https://github.com/vuejs/router/commit/fcf2365556dffa87153c13d31a684070f123ea0e))
- allow numbers as params ([ef0920a](https://github.com/vuejs/router/commit/ef0920a86574bca10836214015c2317ed11a29b7)), closes [#206](https://github.com/vuejs/router/issues/206)
- **router:** allow global router classes ([388735b](https://github.com/vuejs/router/commit/388735bc752852e2a9a24f971207fd81fae45fcf))
- **router:** go, back and forward can be awaited ([eb87757](https://github.com/vuejs/router/commit/eb87757ed189958c8c9955a10ece9306fa99f6d8))
- **warn:** detect missing param in nested absolute paths ([f5b5949](https://github.com/vuejs/router/commit/f5b59493a4e27bf07bd5a0d2e109bc6750f6f1a9))
- **warn:** warn for invalid path+params and redirect ([91f4de9](https://github.com/vuejs/router/commit/91f4de9aab99231fb39ed4cc5b4052979afda216))
- **warn:** warn missing params in alias ([186e275](https://github.com/vuejs/router/commit/186e2755ec0488ff80bdde11a53b0ddc9ee9fc03))
- **warn:** warn when params are provided alongside path ([8a8ddf1](https://github.com/vuejs/router/commit/8a8ddf1a5e5f2d29733da4fe25e4ddb447b0df30))

# [4.0.0-alpha.9](https://github.com/vuejs/router/compare/v4.0.0-alpha.8...v4.0.0-alpha.9) (2020-04-29)

- Removed sourcemaps from build

# [4.0.0-alpha.8](https://github.com/vuejs/router/compare/v4.0.0-alpha.7...v4.0.0-alpha.8) (2020-04-29)

### Bug Fixes

- default matcher options ([cea397b](https://github.com/vuejs/router/commit/cea397b7402cd27ff06013f846bf35966aff6952))
- **guards:** preserve navigation options when redirecting ([9effd81](https://github.com/vuejs/router/commit/9effd816c51b58cb1103d878799aed6992f78454))
- **html5:** correctly preserve current history.state ([0586394](https://github.com/vuejs/router/commit/05863948ee86e0f1c9c9ec31c02ad7af17923743)), closes [#180](https://github.com/vuejs/router/issues/180)
- **link:** make alias of empty child active ([cfe5993](https://github.com/vuejs/router/commit/cfe5993332cc7dc94c5de2f2edb7f2e15c9b7049))
- encode hash ([85bb7e1](https://github.com/vuejs/router/commit/85bb7e11b1a4326f5048a823ae7d49654b308cdd))
- **link:** preserve the alias path ([fffa585](https://github.com/vuejs/router/commit/fffa58585ac89e9fb6b648e61e499a9ee3a9e217))
- **matcher:** merge params ([d8a6b25](https://github.com/vuejs/router/commit/d8a6b2591ac2e37388fb7f4ce8c70922389cedb5)), closes [#189](https://github.com/vuejs/router/issues/189)
- **router:** make redirect relative to target location ([e878e91](https://github.com/vuejs/router/commit/e878e91af217fde6d2e934857ce895e7abbd5920))
- **router:** preserve navigation options with redirects ([9732758](https://github.com/vuejs/router/commit/9732758d076eef252f2940ffa44e44fa94e794a0))
- **view:** render slot with no match ([5873296](https://github.com/vuejs/router/commit/5873296ec96df15f13b0cf02b685ebb36f4e0a41))

### Code Refactoring

- Link and View renamed to RouterLink and RouterView ([030bbc4](https://github.com/vuejs/router/commit/030bbc4c3f68d29a9e9d23ee01603394427427a3))

### Features

- **link:** make empty child active with adjacent children ([4b813b1](https://github.com/vuejs/router/commit/4b813b1ec387f8be9506f1400b7e83fd5794c7af))
- **router:** add global pathOptions ([7383564](https://github.com/vuejs/router/commit/73835649f450ffc378b906c72aa5ae8a6a03feb2))
- add navigation duplicated failure ([9570416](https://github.com/vuejs/router/commit/9570416c75f904a172af07bcf10956fe3385ec13))
- add onBeforeRouteUpdate ([96c9503](https://github.com/vuejs/router/commit/96c95035653a52f94781808fccbf262a02a3cd79))
- resolve relative paths ([eae833e](https://github.com/vuejs/router/commit/eae833e0fc1c8e549f2b4cd47b3dcb90484d17d5))
- **router:** add back,forward,go ([5e927b5](https://github.com/vuejs/router/commit/5e927b5ab8a09c2941edbec7c6af145323c6d3eb))
- **router:** add beforeResolve ([9697134](https://github.com/vuejs/router/commit/9697134c05f0f4c6fde48a773880946074e95666))
- **scroll:** handle scroll on reload ([617f131](https://github.com/vuejs/router/commit/617f131d2473952072f345000c3d43556dfe9761))

### Performance Improvements

- use index access for strings ([971fea4](https://github.com/vuejs/router/commit/971fea415fcce84ce86d8ace67b65115af3b7ac2))

### BREAKING CHANGES

- exported components Link and View have been renamed to be
  include the _Router_ prefix and to have the same export name as their component
  name

# [4.0.0-alpha.7](https://github.com/vuejs/router/compare/v4.0.0-alpha.6...v4.0.0-alpha.7) (2020-04-17)

### Features

- add `$route` and `$router` types ([a4f80aa](https://github.com/vuejs/router/commit/a4f80aaaafb1bf29a3f4d992e8c6a2bec0f70d62))
- add guards types ([c7ccd5a](https://github.com/vuejs/router/commit/c7ccd5a0e67d88467fc661474308fbdf55b947ec))
- refactor navigation to comply with vuejs/rfcs[#150](https://github.com/vuejs/router/issues/150) ([290c3be](https://github.com/vuejs/router/commit/290c3be1f6cb476016f23b77d6fc49987dd84751))

### BREAKING CHANGES

- This follows the RFC at https://github.com/vuejs/rfcs/pull/150
  Summary: `router.afterEach` and `router.onError` are now the global equivalent of
  `router.push`/`router.replace` as well as navigation through the interface
  (`history.go()`). A navigation only rejects if there was an unexpected error.
  A navigation failure will still resolve the promise returned by `router.push`
  and be exposed as the resolved value.

# [4.0.0-alpha.6](https://github.com/vuejs/router/compare/v4.0.0-alpha.5...v4.0.0-alpha.6) (2020-04-17)

### Bug Fixes

- **history:** allow base with / and base tag ([d7c71b5](https://github.com/vuejs/router/commit/d7c71b55ee4a11ecaf3a72f25eb126d118829d3f)), closes [#164](https://github.com/vuejs/router/issues/164)
- **history:** allow hash history with no origin ([760d216](https://github.com/vuejs/router/commit/760d21672051b6338d40f2cdfdac80dc16209e13)), closes [#163](https://github.com/vuejs/router/issues/163)
- **scroll:** only apply on browser ([cf53192](https://github.com/vuejs/router/commit/cf53192b77d619b1e43c8decda76d4083d9c17ea))
- revert history navigation if navigation is cancelled ([d8a0d11](https://github.com/vuejs/router/commit/d8a0d117dbede9b177f06c8ebab201d12dfca0c0))

### Code Refactoring

- **router:** merge createHref into resolve ([66b2db9](https://github.com/vuejs/router/commit/66b2db95b6b73433dc3abbe6c6f7f07959429d78))

### Features

- add this.\$route ([92dc18d](https://github.com/vuejs/router/commit/92dc18d448ffeb57d9b3f3b303b8ec2991175eb5))
- add this.\$router ([1807f30](https://github.com/vuejs/router/commit/1807f301053ac93db1e50991f67dcf532990d5c9))
- **scroll:** handle scroll on popstate ([181efe9](https://github.com/vuejs/router/commit/181efe9f29a200b03e2d8f4759e7854047936824))
- merge meta fields ([72a052f](https://github.com/vuejs/router/commit/72a052fdf4a198e3ac72779f1b7b8b80d0ac018d))
- **guards:** support errors in navigation guards ([23ed08d](https://github.com/vuejs/router/commit/23ed08d983f308b7b118f2a235e58d29bf1994ec))
- **router:** hasRoute ([ca02444](https://github.com/vuejs/router/commit/ca02444c91c8f6b21caf6a71dee5d0f2e3f7e51b))

### Reverts

- Revert "test: only call browser.end on the last test" ([d3221f1](https://github.com/vuejs/router/commit/d3221f16978186b09531f7ea0cb5b92b20147181))

### BREAKING CHANGES

- **router:** createHref is removed from the router. Instead, resolve
  returns a location object with the corresponding `href` property

# [4.0.0-alpha.5](https://github.com/vuejs/router/compare/v4.0.0-alpha.4...v4.0.0-alpha.5) (2020-04-08)

### Bug Fixes

- **link:** not active when matched is empty ([acd644d](https://github.com/vuejs/router/commit/acd644db70793da7719b321b2dcdd537ec358f9c))
- check query and hash when navigating ([3862ad9](https://github.com/vuejs/router/commit/3862ad924bbc734a835577c3a3c71bc3550db29c))
- ignore order of keys in query and params ([643bd15](https://github.com/vuejs/router/commit/643bd15ceaf9d6314434b15b169171b599b58e1c))
- skip initial guards with static redirect ([c76bb93](https://github.com/vuejs/router/commit/c76bb938a2c9a1790be98b6ce44ccd153a342141))
- **types:** add missing exported types ([ec241f7](https://github.com/vuejs/router/commit/ec241f7a93107815d9ffd25d36cbf00b47cb7318)), closes [#147](https://github.com/vuejs/router/issues/147)

### Features

- allow symbols as route record name ([f42ab3f](https://github.com/vuejs/router/commit/f42ab3fecfaecddcef0ccf8bb0f7f44ca24d6160))
- **link:** activeClass and exactActiveClass props ([d53b383](https://github.com/vuejs/router/commit/d53b3832b50131cb83b8c567015780e60addb6c8))
- **link:** allow `custom` prop ([874510b](https://github.com/vuejs/router/commit/874510be69c3b068970e8a90ae251cf487d6acf9))

### BREAKING CHANGES

- Renamed types by removing suffix Normalized and using Raw instead
  - `RouteLocation` -> `RouteLocationRaw`
  - `RouteLocationNormalized` -> `RouteLocation`
  - `RouteLocationNormalized` is now a location that can be displayed (not a static redirect)
  - `RouteLocationNormalizedResolved` -> `RouteLocationNormalizedLoaded`
  - `RouteRecord` -> `RouteRecordRaw`
  - `RouteRecordNormalized` -> `RouteRecord`
  - `RouteRecordNormalized` is now a record that is not a static redirect

# [4.0.0-alpha.4](https://github.com/vuejs/router/compare/v4.0.0-alpha.3...v4.0.0-alpha.4) (2020-03-28)

### Bug Fixes

- **history:** use current history state when replacing ([5d80209](https://github.com/vuejs/router/commit/5d802094923851102557bfb2583835cc135e16b8))
- export more types ([1583d48](https://github.com/vuejs/router/commit/1583d480fff2da1caa35c2dd7892c36b57dad734)), closes [#137](https://github.com/vuejs/router/issues/137)
- **guards:** free instances only if navigation is confirmed ([d0514e1](https://github.com/vuejs/router/commit/d0514e192839c54c4181f80286602e9d37459f4d))
- **hash:** fix base position for hash routing ([ba40b8f](https://github.com/vuejs/router/commit/ba40b8f0cf2d6d85533e0e7e7daaadd088298f19))
- initial location with base ([d05208b](https://github.com/vuejs/router/commit/d05208b6c9457931bda8205ba6d9f1d5e39a54c7))
- **router:** prevent duplicated navigation on aliases ([e825586](https://github.com/vuejs/router/commit/e82558684c0b6b688065032df65604b2c245d395))

### Features

- allow passing state to history ([ac1c96f](https://github.com/vuejs/router/commit/ac1c96f176dcad8aac03a86a1dccfbaab4b66520))
- improve route access ([baf266c](https://github.com/vuejs/router/commit/baf266cd1bd6cafd32d244f185e340bee10af32c))
- **history:** expose state on html5 ([3f83607](https://github.com/vuejs/router/commit/3f83607c8798960f49cdb5eed8fdfe8adc52fabf))
- **matcher:** remove aliases alongside the original record ([26b71b2](https://github.com/vuejs/router/commit/26b71b285b743ab8af94b9297fa7037872ae0de6))
- **router:** support custom parseQuery and stringifyQuery ([#136](https://github.com/vuejs/router/issues/136)) ([5dce7bc](https://github.com/vuejs/router/commit/5dce7bcbfbb4a80bd1edbe061a250fa646f2afd7))
- **view:** add props option as boolean ([7fe1e7d](https://github.com/vuejs/router/commit/7fe1e7dc7406bddd0924bf7f01709b9113582472))
- **view:** allow passing props as a function ([494fc5e](https://github.com/vuejs/router/commit/494fc5efb6add93c68ed467bb9a8dc7b3b149fff))
- **view:** useView to customize router-view ([06b0c34](https://github.com/vuejs/router/commit/06b0c34ee5018aa9d76c0bfcd32ff2c12cd94277))
- allow true in `next` ([d76c6aa](https://github.com/vuejs/router/commit/d76c6aae115110e2d9c4c072748bd9403080c8bd))
- invoke guards with the right context ([7053413](https://github.com/vuejs/router/commit/7053413c93bc715d5c2179378367dc12f60a118d))
- lazy loading ([6ecdc70](https://github.com/vuejs/router/commit/6ecdc70baa6361b8614368196ff2652560b6a0ba))
- **view:** allow props as object in record ([fd4dc06](https://github.com/vuejs/router/commit/fd4dc0630bdf856f972ed6e9020b70a70ac582b4))

### BREAKING CHANGES

- `useRoute` now retrieves a reactive RouteLocationNormalized instead of a Ref<RouteLocationNormalized>.
  This means there is no need to use `.value` when accessing the route. You still need to wrap it with `toRefs` if you want to expose parts of the route:
  ```js
  setup () {
    return { params: toRefs(useRoute()).params }
  }
  ```

# [4.0.0-alpha.3](https://github.com/vuejs/router/compare/v4.0.0-alpha.2...v4.0.0-alpha.3) (2020-03-14)

### Bug Fixes

- add missing type definitions

# [4.0.0-alpha.2](https://github.com/vuejs/router/compare/v4.0.0-alpha.1...v4.0.0-alpha.2) (2020-03-14)

### Bug Fixes

- **history:** correct url when replacing current location ([704b45e](https://github.com/vuejs/router/commit/704b45ea52b10099a765c93ced37d03393a72d17))
- **link:** allow attrs to override behavior ([4cae9db](https://github.com/vuejs/router/commit/4cae9dbede993a79577691e1df4444a8fe5ca3a0))
- **link:** allow custom classes ([#134](https://github.com/vuejs/router/issues/134)) ([392c295](https://github.com/vuejs/router/commit/392c295552e5b7dbe1d494c1c3168571e3339153)), closes [#133](https://github.com/vuejs/router/issues/133)
- **link:** navigate to the alias path ([3284110](https://github.com/vuejs/router/commit/328411079e1aa8a5dc3903ae76a55d634946d9fd))
- **link:** non active repeatable params ([0ccbc1e](https://github.com/vuejs/router/commit/0ccbc1e9af07a30a149ab14c007f63cbc35a8126))

### Features

- add aliasOf to normalized records ([d9f3174](https://github.com/vuejs/router/commit/d9f31748802c39572254691108b0667cfd40e911))
- handle active/exact in Link ([6f49dce](https://github.com/vuejs/router/commit/6f49dcea35a63785ae08d08787913ab8391cae67))
- **matcher:** link aliases to their original record ([e9eb648](https://github.com/vuejs/router/commit/e9eb6481e21de61080a96f66fbd8640157d0fd27))

# [4.0.0-alpha.1](https://github.com/vuejs/router/compare/v4.0.0-alpha.0...v4.0.0-alpha.1) (2020-02-26)

### Code Refactoring

- rename createHistory and createHashHistory ([7dbebb6](https://github.com/vuejs/router/commit/7dbebb6e2d75ab4aa77019712f2ed251ad62464f))

### Features

- add dynamic routing at router level ([a7943c6](https://github.com/vuejs/router/commit/a7943c64383bced7ff90ae92c0498827acdb71f6))

### BREAKING CHANGES

- `createHistory` is now named `createWebHistory`.
  `createHashHistory` is now named `createWebHashHistory`.

  Both createHistory and createHashHistory are renamed to
  better reflect that they must be used in a browser environment while
  createMemoryHistory doesn't.

# [4.0.0-alpha.0](https://github.com/vuejs/router/compare/v0.0.11...v4.0.0-alpha.0) (2020-02-26)

## Known issues

### Breaking changes compared to vue-router@3.x

- `mode: 'history'` -> `history: createHistory()`
- Catch all routes (`/*`) must now be defined using a parameter with a custom regex: `/:catchAll(.*)`

### Missing features

- `keep-alive` is not yet supported
- Partial support of per-component navigation guards. No `beforeRouteEnter` yet
