# Money Press — WooCommerce Launch Pack

**Store:** Money Press
**Platform:** WooCommerce (WordPress)
**Niche:** Finance-meets-streetwear — apparel, accessories, digital products, and wealth-mindset goods
**Status:** Launch Ready

---

## What's Included

```
woocommerce-launch-pack-money-press/
├── README.md                          ← you are here
├── import/
│   ├── products.csv                   ← product catalog (12 SKUs, variable products)
│   └── navigation.json                ← menu structure (main + footer)
└── content/
    ├── pages/
    │   ├── homepage.md                ← homepage section copy
    │   ├── about.md                   ← brand story page
    │   ├── faq.md                     ← FAQ page
    │   └── contact.md                 ← contact page
    ├── blog/
    │   ├── 01-how-to-start-pressing-money.md
    │   ├── 02-build-your-wealth-wardrobe.md
    │   └── 03-top-roi-mindset-habits.md
    └── policies/
        ├── shipping-policy.md
        ├── return-policy.md
        ├── privacy-policy.md
        └── terms-of-service.md
```

---

## Product Strategy Overview

Money Press is built around three high-ROI product tiers:

| Tier | Category | Margin | Purpose |
|------|----------|--------|---------|
| Core | Apparel (hoodies, tees, caps) | 50-65% | Brand identity, repeat purchases |
| Upsell | Accessories (wallet, sticker pack) | 60-75% | AOV booster, impulse buy |
| Digital | Starter Kit PDF bundle | 85-97% | Zero fulfillment cost, instant revenue |
| Anchor | Wealth Journal | 55-70% | Brand loyalty, daily touchpoint |

---

## Optional Tooling — WordPress MCP

- MCP server config: `.vscode/mcp.json`
- Server: `wpcom-mcp`
- Endpoint: `https://public-api.wordpress.com/wpcom/v2/mcp/v1`
- Reload VS Code window after MCP config changes

---

## WooCommerce Setup Checklist

### 1. WordPress + WooCommerce Installation
- [ ] Install WordPress (recommended: WP Engine, Kinsta, or SiteGround hosting)
- [ ] Install WooCommerce plugin
- [ ] Install Elementor or Kadence Blocks (for homepage page builder sections)
- [ ] Install WooCommerce PDF Invoices & Packing Slips
- [ ] Install WooCommerce Product CSV Import Suite (for products.csv bulk import)

### 2. Theme Setup
- Recommended themes: Flatsome, Astra (WooCommerce-optimized), or GeneratePress
- Brand colors: Black `#0A0A0A`, Gold `#C9A84C`, Off-White `#F5F0E8`, Forest Green `#1A3C2A`
- Font pairing: Monument Extended (headings) + Inter (body) or Neue Haas Grotesk + IBM Plex Mono

### 3. Product Import
- Go to WooCommerce > Products > Import
- Upload `import/products.csv`
- Map columns: Name, SKU, Price, Regular Price, Description, Short Description, Tags, Category, Weight
- Review and confirm

### 4. Navigation Setup
- Reference `import/navigation.json` for menu structure
- Go to Appearance > Menus
- Create "Main Menu" and "Footer Menu" using the structure provided
- Assign to theme locations

### 5. Pages Setup
- Create pages: Homepage, About, FAQ, Contact
- Paste content from `content/pages/*.md` into each page (use page builder for homepage)
- Create Blog posts from `content/blog/*.md`
- Create Policy pages from `content/policies/*.md`

### 6. WooCommerce Settings
- [ ] Set currency: USD
- [ ] Configure Stripe and/or PayPal payment gateway
- [ ] Set up tax rules (based on your state/jurisdiction)
- [ ] Configure Printful or Printify plugin for POD apparel (hoodie, tee, cap)
- [ ] Configure email template with Money Press branding
- [ ] Set up order confirmation and shipping notification emails
- [ ] Enable product reviews

### 7. Digital Product Setup
- Install "Easy Digital Downloads" plugin or use WooCommerce's built-in downloadable product type
- Upload PDF files for the Money Press Starter Kit
- Set product type to "Downloadable" — no shipping required
- Configure automatic email delivery of download link post-purchase

### 8. Shipping Setup
- Connect ShipStation, Shippo, or WooCommerce Shipping for label printing
- Free shipping threshold: $75+
- Set flat-rate fallback: $5.99 standard, $12.99 expedited
- International: calculate at checkout via carrier API

### 9. Pre-Launch Checklist
- [ ] Test checkout flow with real card (then refund)
- [ ] Verify all product variants display correctly
- [ ] Test digital product download delivery
- [ ] Confirm all policy pages are linked in footer
- [ ] Set up Google Analytics 4 + Meta Pixel
- [ ] Connect email list (Klaviyo or Mailchimp) with welcome flow
- [ ] Enable SSL certificate (HTTPS)
- [ ] Submit sitemap to Google Search Console

---

## Support Contact
Update all policy pages and email templates with your actual support email before going live.

Placeholder: `support@facetea.com`
