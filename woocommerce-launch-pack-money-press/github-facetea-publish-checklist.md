# Money Press — GitHub Publish Checklist (facetea)

Use this checklist to ship the `facetea` domain configuration from your GitHub repository.

## 1) Commit and Push
- [ ] Review changes in `woocommerce-launch-pack-money-press/`
- [ ] Commit with message: `chore: prepare Money Press launch pack for facetea domain`
- [ ] Push to `main` (or open a PR first if you prefer review)

## 2) Protect and Back Up
- [ ] Ensure branch protection is enabled for `main`
- [ ] Add repository backup or mirror policy
- [ ] Tag release: `money-press-facetea-launch-v1`

## 3) Store Config Sync
- [ ] Confirm support emails are `support@facetea.com` in all content and settings
- [ ] Use `facetea-domain-config.md` as source of truth during WordPress setup
- [ ] Apply values in Hostinger + WooCommerce settings

## 4) Domain + DNS
- [ ] Verify `facetea.com` DNS in Hostinger (`A` for root + `CNAME` for `www`)
- [ ] Set `www.facetea.com` CNAME to `facetea.com`
- [ ] Install SSL and force HTTPS redirects

## 5) Smoke Test Before Launch
- [ ] Open homepage, product page, cart, checkout, and contact page
- [ ] Place one physical and one digital test order
- [ ] Verify transactional email sender is `support@facetea.com`
- [ ] Confirm policy links and sitemap URL use `facetea.com`
