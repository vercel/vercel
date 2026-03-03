# Money Press — Hostinger Deployment Checklist

Complete these steps in order. Each section builds on the last.

---

## Phase 1 — Hostinger Setup

### 1.1 Domain
- [ ] Log in to [hpanel.hostinger.com](https://hpanel.hostinger.com)
- [ ] If your domain is already on Hostinger, skip nameserver changes and verify existing DNS records in hPanel
- [ ] If your domain is not yet on Hostinger, point nameservers to Hostinger (DNS propagation takes up to 24 hours)
- [ ] In hPanel → Domains → verify the domain shows "Active"

### 1.2 SSL Certificate
- [ ] hPanel → SSL → Install free SSL (Let's Encrypt) for your domain
- [ ] Wait for SSL to activate (usually under 10 minutes)
- [ ] Once active, open `.htaccess` and uncomment the HTTPS redirect block at the bottom

### 1.3 Install WordPress
- [ ] hPanel → Websites → Add Website → Select your domain
- [ ] Choose "WordPress" from the auto-installer
- [ ] Set:
  - Site title: `Money Press`
  - Admin email: `support@facetea.com`
  - Admin username: (choose something other than "admin")
  - Admin password: (use a strong password — 16+ chars)
- [ ] Click Install — takes 1–3 minutes

### 1.4 Upload .htaccess
- [ ] hPanel → File Manager → Navigate to `public_html/`
- [ ] If a `.htaccess` file exists, open it — it will have a WordPress block already
- [ ] If it already has the `# BEGIN WordPress` block, copy only the sections below it from this repo's `.htaccess` (Security, Performance, WooCommerce, HTTPS sections)
- [ ] If the file is empty or only has the WordPress block, replace it entirely with the `.htaccess` from this repo

### 1.5 Update wp-config.php
- [ ] hPanel → File Manager → `public_html/wp-config.php` → Edit
- [ ] Visit https://api.wordpress.org/secret-key/1.1/salt/ — copy all 8 lines
- [ ] In wp-config.php, find and replace the existing `AUTH_KEY`, `SECURE_AUTH_KEY`, etc. lines with the generated ones
- [ ] Below those lines, paste everything from `import/wp-config-snippet.php` (skip the `<?php` line)
- [ ] Save

---

## Phase 2 — WordPress Configuration

### 2.1 Install WooCommerce
- [ ] WordPress Admin → Plugins → Add New → Search "WooCommerce" → Install & Activate
- [ ] Run through the WooCommerce Setup Wizard:
  - Store country: United States → your state
  - Currency: USD
  - Industry: Fashion, apparel & accessories
  - Product types: Physical products + Downloadable products
  - Business details: skip or fill in

### 2.2 Install Theme
Recommended free options that work well with WooCommerce:
- **Storefront** (official WooCommerce theme) — simplest, most compatible
- **Astra** — faster, more flexible
- [ ] WordPress Admin → Appearance → Themes → Add New → install your chosen theme
- [ ] Set brand colors (from `import/woocommerce-settings.json` → email section):
  - Primary: `#000000` (Black)
  - Accent: `#C9A84C` (Gold)
  - Background: `#FFFFFF`
  - Text: `#1A1A1A`

### 2.3 Install Recommended Plugins
Install these from WordPress Admin → Plugins → Add New (in order):

- [ ] **Stripe for WooCommerce** — payment processing
- [ ] **WooCommerce PayPal Payments** — PayPal + Pay Later
- [ ] **LiteSpeed Cache** — caching (Hostinger uses LiteSpeed, this plugin is already optimized for it)
- [ ] **WP Mail SMTP** — configure with Hostinger email or a transactional service
- [ ] **Wordfence Security** — run initial scan after setup
- [ ] **UpdraftPlus** — set up automated backups before going live
- [ ] **Yoast SEO** — configure sitemap and meta defaults
- [ ] **WooCommerce PDF Invoices & Packing Slips** — attach invoice to order emails

---

## Phase 3 — Store Content

### 3.1 Create Policy Pages
Create each as a WordPress Page (Pages → Add New), then assign in WooCommerce → Settings → Advanced:

- [ ] **Privacy Policy** — paste content from `content/policies/privacy-policy.md`
- [ ] **Terms of Service** — paste from `content/policies/terms-of-service.md`
- [ ] **Shipping Policy** — paste from `content/policies/shipping-policy.md`
- [ ] **Return & Refund Policy** — paste from `content/policies/return-policy.md`

### 3.2 Create Store Pages
- [ ] **About** — paste content from `content/pages/about.md`
- [ ] **FAQ** — paste content from `content/pages/faq.md`
- [ ] **Contact** — paste content from `content/pages/contact.md`
  - Add a Contact Form 7 or WPForms contact form to match the fields in the file
- [ ] **Homepage** — use your theme's page builder or block editor with sections from `content/pages/homepage.md`
  - WordPress Admin → Settings → Reading → set Homepage to your new homepage page

### 3.3 Create Blog Posts
- [ ] WordPress Admin → Posts → Add New
- [ ] Create all 3 posts from `content/blog/`:
  - `01-how-to-start-pressing-money.md`
  - `02-build-your-wealth-wardrobe.md`
  - `03-top-roi-mindset-habits.md`
- [ ] Set categories: "Money" or "Lifestyle" — create these categories first

---

## Phase 4 — Products

### 4.1 Import Products via CSV
- [ ] WooCommerce → Products → Import
- [ ] Upload `import/products.csv`
- [ ] Map columns (WooCommerce auto-detects most fields)
- [ ] Run import — review results for any errors
- [ ] After import: check each variable product has correct attributes and variations

### 4.2 Add Product Images
The CSV does not include image files — you need to upload these manually:
- [ ] Upload product photos via WordPress Media Library or directly on each product page
- [ ] Recommended image size: 800x800px minimum, square crop, white or dark background

### 4.3 Configure Digital Products
- [ ] Find MP-DIGITAL-KIT and MP-DIGITAL-BUDGET in your product list
- [ ] On each: check "Downloadable" and "Virtual" checkboxes
- [ ] Upload the actual PDF/Sheets files under "Downloadable files"
- [ ] Set Download limit: Unlimited
- [ ] Set Download expiry: Never

---

## Phase 5 — Shipping & Tax

### 5.1 Configure Shipping Zones
Reference `import/shipping-zones.json` — set these up manually in WooCommerce → Settings → Shipping:

- [ ] **Zone 1 — United States:** Free Shipping ($75+), Standard ($5.99), Expedited ($14.99)
- [ ] **Zone 2 — Canada:** International Standard ($18.99)
- [ ] **Zone 3 — International (select countries):** International Standard ($24.99)
- [ ] **Zone 4 — Digital/Rest of World:** Instant Digital Delivery ($0) — apply only to digital shipping class

### 5.2 Create Shipping Classes
WooCommerce → Settings → Shipping → Shipping classes:
- [ ] Create "Digital Products" class (`digital`) — assign to MP-DIGITAL-KIT, MP-DIGITAL-BUDGET
- [ ] Create "Standard Apparel" class (`apparel`) — assign to hoodies, tees, crewnecks
- [ ] Create "Accessories" class (`accessories`) — assign to caps, wallets, pins, stickers

### 5.3 Configure Tax
- [ ] WooCommerce → Settings → Tax → Enable tax calculations
- [ ] Prices entered exclusive of tax
- [ ] Tax based on: Customer shipping address
- [ ] Recommend installing TaxJar or Avalara plugin for automated US state tax compliance
- [ ] If handling manually: add California rate (7.25%) in Standard Rates as a starting point

---

## Phase 6 — Navigation

### 6.1 Build Menus
Reference `import/navigation.json` — create in WordPress Appearance → Menus:

**Main Menu** (assign to Primary location):
- [ ] Shop → All Products, Best Sellers, Apparel, Accessories, Digital Products, Bundles
- [ ] Best Sellers
- [ ] Bundles
- [ ] Digital
- [ ] About
- [ ] Blog
- [ ] Contact

**Footer Menu** (assign to Footer location):
- [ ] Shipping Policy
- [ ] Return Policy
- [ ] Privacy Policy
- [ ] Terms of Service
- [ ] FAQ
- [ ] Contact

---

## Phase 7 — Payments

### 7.1 Stripe
- [ ] WooCommerce → Settings → Payments → Stripe → Configure
- [ ] Connect your Stripe account (or create one at stripe.com)
- [ ] Enable: Credit/Debit cards, Apple Pay, Google Pay
- [ ] Test with Stripe test mode before going live

### 7.2 PayPal
- [ ] WooCommerce → Settings → Payments → PayPal Payments → Configure
- [ ] Connect your PayPal business account
- [ ] Enable PayPal, Pay Later

---

## Phase 8 — Email

### 8.1 Configure WP Mail SMTP
- [ ] WP Mail SMTP → Setup Wizard
- [ ] Use Hostinger email (create `orders@facetea.com` in hPanel → Email → Create account)
- [ ] Or use a transactional service: SendGrid (free up to 100/day) or Mailgun
- [ ] SMTP settings for Hostinger email:
  - Host: `smtp.hostinger.com`
  - Port: `465` (SSL) or `587` (TLS)
  - Username: your full email address
  - Password: your email password

### 8.2 Customize WooCommerce Emails
- [ ] WooCommerce → Settings → Emails
- [ ] From name: `Money Press`
- [ ] From address: `support@facetea.com`
- [ ] Footer text: `Money Press | Built To Stack`
- [ ] Header color: `#000000`
- [ ] Send a test email to confirm delivery

---

## Phase 9 — SEO & Analytics

- [ ] Yoast SEO → General → confirm sitemap is enabled
- [ ] Submit sitemap to Google Search Console: `facetea.com/sitemap_xml`
- [ ] Set homepage SEO title and meta description in Yoast
- [ ] (Optional) Install Meta Pixel via a plugin like PixelYourSite for Facebook/Instagram ads

---

## Phase 10 — Pre-Launch

- [ ] Test checkout end-to-end using Stripe test cards (card: `4242 4242 4242 4242`, any future date, any CVV)
- [ ] Place a test order for a digital product — confirm download link arrives by email
- [ ] Confirm shipping rates appear correctly at checkout for a US address
- [ ] Confirm free shipping triggers at $75
- [ ] Check all policy pages are linked in footer
- [ ] Check all product images are uploaded and displaying
- [ ] Run Wordfence scan — resolve any issues
- [ ] Set up UpdraftPlus backup schedule (daily, store to Google Drive)
- [ ] Switch Stripe from test mode to live mode
- [ ] Remove any "Coming Soon" or maintenance mode
- [ ] Announce launch

---

## Files in This Launch Pack

| File | Purpose |
|------|---------|
| `.htaccess` | Upload to WordPress root (`public_html/`) |
| `import/wp-config-snippet.php` | Add constants to `wp-config.php` |
| `import/products.csv` | Import via WooCommerce → Products → Import |
| `import/shipping-zones.json` | Reference when setting up shipping zones manually |
| `import/woocommerce-settings.json` | Reference for all WooCommerce settings |
| `import/navigation.json` | Reference when building menus |
| `content/pages/*.md` | Paste into WordPress pages |
| `content/blog/*.md` | Create as WordPress posts |
| `content/policies/*.md` | Create as WordPress pages, assign in WooCommerce |

---

Support contact: support@facetea.com
