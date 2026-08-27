import type { LoadArgs } from 'modulato'

export function load({ content }: LoadArgs) {
  return { title: content.site.title, tagline: content.site.tagline }
}

export function meta() {
  return {
    title: 'Motion-first — a Modulato site',
    description: 'Scaffolded by create-modulato.',
  }
}
