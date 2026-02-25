# Sweat Tee's Shopify Launch Pack

This folder contains a complete launch-ready content and import pack for your storefront.

## What's Included

- `import/products.csv` → Product import file (8 products, variants, tags, SEO, pricing placeholders)
- `import/navigation.json` → Main and footer menu structure
- `content/pages/homepage.md` → Homepage section-by-section copy
- `content/pages/about.md` → About page copy
- `content/pages/faq.md` → FAQ page copy
- `content/pages/contact.md` → Contact page copy
- `content/policies/shipping-policy.md` → Shipping policy draft
- `content/policies/return-policy.md` → Return policy draft
- `content/policies/privacy-policy.md` → Privacy policy draft
- `content/policies/terms-of-service.md` → Terms of service draft
- `content/blog/*.md` → Three launch blog posts

## 1) Import Products

1. In Shopify Admin, go to **Products → Import**.
2. Upload `import/products.csv`.
3. Check the preview mapping before final import.
4. Replace placeholder image URLs with your real product image URLs.

## 2) Create Collections

Create these manual collections and assign products:
- Best Sellers
- New Drops
- Bundles
- All Products (usually auto-generated)

## 3) Build Navigation

Use `import/navigation.json` as your reference in:
- **Online Store → Navigation → Main menu**
- **Online Store → Navigation → Footer menu**

## 4) Add Site Pages

Create pages and paste content from:
- About → `content/pages/about.md`
- FAQ → `content/pages/faq.md`
- Contact → `content/pages/contact.md`

## 5) Configure Policies

In **Settings → Policies**, paste and customize:
- `content/policies/shipping-policy.md`
- `content/policies/return-policy.md`
- `content/policies/privacy-policy.md`
- `content/policies/terms-of-service.md`

Replace placeholders:
- `[Insert Date]`
- `[currency]`
- `[jurisdiction]`
- return shipping rule in return policy

## 6) Set Homepage

In **Online Store → Themes → Customize**, add sections in this order:
1. Announcement Bar
2. Hero
3. Featured Collection (Best Sellers)
4. Value Props (3 columns)
5. Featured Product
6. Bundle Highlight
7. FAQ Teaser
8. Email Signup

Use copy from `content/pages/homepage.md`.

## 7) Publish Blog

Create 3 posts in **Content → Blog posts** and paste:
- `content/blog/01-how-to-hide-pit-stains.md`
- `content/blog/02-how-to-build-a-no-sweat-rotation.md`
- `content/blog/03-tee-care-for-longer-life.md`

## 8) Final Launch Checklist

- Payment provider enabled
- Shipping rates configured
- Domain connected
- Legal policies reviewed
- Test order completed
- Remove storefront password (if ready)

## Important Notes

- This pack is production-ready but includes placeholders where your final legal/business details are required.
- Replace all `cdn.example.com` image URLs before launch.
- Confirm product pricing, SKU naming, and inventory counts before publishing.
