# @vueuse/head

[![npm version](https://badgen.net/npm/v/@vueuse/head)](https://npm.im/@vueuse/head) [![npm downloads](https://badgen.net/npm/dm/@vueuse/head)](https://npm.im/@vueuse/head)

Document head manager for Vue 3.

`@vueuse/head` is a [Vue composition API](https://v3.vuejs.org/guide/composition-api-introduction.html) that helps you manage `<title>`, `<meta>` and other elements inside document head, it has no dependencies and we always try to keep it as slim as possible.

**💛 Support the ongoing development of this project by [becoming a GitHub Sponsor](https://github.com/sponsors/egoist)**.

## Installation

```bash
npm i @vueuse/head
# Or Yarn
yarn add @vueuse/head
```

## Usage

Register the Vue plugin:

```ts
import { createApp } from 'vue'
import { createHead } from '@vueuse/head'

const app = createApp()
const head = createHead()

app.use(head)

app.mount('#app')
```

Manage `head` with the composition API `useHead` in your component:

```vue
<script>
import { defineComponent, computed, reactive } from 'vue'
import { useHead } from '@vueuse/head'

export default defineComponent({
  setup() {
    const siteData = reactive({
      title: `My website`,
      description: `My beautiful website`,
    })

    useHead({
      // Can be static or computed
      title: computed(() => siteData.title),
      meta: [
        {
          name: `description`,
          content: computed(() => siteData.description),
        },
      ],
    })
  },
})
</script>
```

### Server-side rendering

```ts
import { renderToString } from '@vue/server-renderer'
import { renderHeadToString } from '@vueuse/head'

const appHTML = await renderToString(yourVueApp)

// `head` is created from `createHead()`
const { headTags, htmlAttrs, bodyAttrs } = renderHeadToString(head)

const finalHTML = `
<html${htmlAttrs}>

  <head>
    ${headTags}
  </head>

  <body${bodyAttrs}>
    <div id="app">${appHTML}</div>
  </body>

</html>
`
```

## API

### `createHead()`

Create the head manager instance.

### `useHead(head: HeadObject | Ref<HeadObject>)`

```ts
interface HeadObject {
  title?: MaybeRef<string>
  meta?: MaybeRef<HeadAttrs[]>
  link?: MaybeRef<HeadAttrs[]>
  base?: MaybeRef<HeadAttrs>
  style?: MaybeRef<HeadAttrs[]>
  script?: MaybeRef<HeadAttrs[]>
  htmlAttrs?: MaybeRef<HeadAttrs>
  bodyAttrs?: MaybeRef<HeadAttrs>
}

interface HeadAttrs {
  [attrName: string]: any
}
```

For `meta` tags, we use `name` and `property` to prevent duplicated tags, you can instead use the `key` attribute if the same `name` or `property` is allowed:

```ts
useHead({
  meta: [
    {
      property: 'og:locale:alternate',
      content: 'zh',
      key: 'zh',
    },
    {
      property: 'og:locale:alternate',
      content: 'en',
      key: 'en',
    },
  ],
})
```

To set the `textContent` of an element, use the `children` attribute:

```ts
useHead({
  style: [
    {
      children: `body {color: red}`,
    },
  ],
})
```

`useHead` also takes reactive object or ref as the argument, for example:

```ts
const head = reactive({ title: 'Website Title' })
useHead(head)
```

```ts
const title = ref('Website Title')
useHead({ title })
```

### `<Head>`

Besides `useHead`, you can also manipulate head tags using the `<Head>` component:

```vue
<script setup lang="ts">
import { Head } from '@vueuse/head'
</script>

<template>
  <Head>
    <title>Hello World</title>
    <base href="/base" />
    <html lang="en-US" class="theme-dark" />
  </Head>
</template>
```

Note that you need to use `<html>` and `<body>` to set `htmlAttrs` and `bodyAttrs` respectively, children for these two tags and self-closing tags like `<meta>`, `<link>` and `<base>` are also ignored.

### `renderHeadToString(head: Head)`

- Returns: `HTMLResult`

```ts
interface HTMLResult {
  // Tags in `<head>`
  readonly headTags: string
  // Attributes for `<html>`
  readonly htmlAttrs: string
  // Attributes for `<body>`
  readonly bodyAttrs: string
}
```

Render the head manager instance to HTML tags in string form.

## Sponsors

[![sponsors](https://sponsors-images.egoist.sh/sponsors.svg)](https://github.com/sponsors/egoist)

## License

MIT &copy; [EGOIST](https://egoist.sh)
