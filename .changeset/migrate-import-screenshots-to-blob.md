---
'@vercel/frameworks': patch
---

Move framework import screenshots from Cloudinary (`assets.vercel.com`) to Vercel Blob. The four affected entries (Next.js, Nuxt, SvelteKit, SvelteKit legacy) now point at `https://py8fhxnkzwtsqdo9.public.blob.vercel-storage.com/front/import/*.png`. Same images, different host — consumers see no behavior change.
