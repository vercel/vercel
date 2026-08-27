import { defineConfig } from 'modulato/config'
import { localJson } from '@modulato/content-local'

export default defineConfig({
  // Site-wide <head>, SSR'd on every page. Swap the Modulato mark in
  // public/ for your own favicon when you have one.
  head: {
    link: [
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'alternate icon', href: '/favicon.ico', sizes: '48x48' },
    ],
  },
  // content/*.json -> typed snapshot. Pull + typegen: npx modulato content
  content: localJson({ dir: 'content' }),
  // Defined once, used everywhere: useViewport(), motion-token overrides
  // (phone: {...} blocks in motion.ts), the Tweak overlay switcher.
  breakpoints: {
    phone: '(max-width: 767px)',
    tablet: '(min-width: 768px) and (max-width: 1279px)',
  },
})
