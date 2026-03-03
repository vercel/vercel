# Money Press — facetea Domain Config

Use these values consistently across WordPress, WooCommerce, DNS, and email.

## Primary Domain
- Production domain: `facetea.com`
- WWW redirect: `www.facetea.com` → `facetea.com`
- Admin URL: `https://facetea.com/wp-admin`

## Store Identity
- Store name: `Money Press`
- Public support email: `support@facetea.com`
- Order inbox (recommended): `orders@facetea.com`

## WooCommerce Defaults
- `woocommerce_email_from_name`: `Money Press`
- `woocommerce_email_from_address`: `support@facetea.com`
- `woocommerce_stock_email_recipient`: `support@facetea.com`

## DNS Baseline
- `A` record: `@` → Hostinger origin IP
- `CNAME` record: `www` → `facetea.com`
- MX records: Hostinger mail records for `facetea.com`
- SPF/DKIM/DMARC: enable in Hostinger email panel before launch

## Pre-Launch Domain Checks
- `https://facetea.com` loads with valid SSL
- `http://facetea.com` redirects to HTTPS
- `https://www.facetea.com` redirects to `https://facetea.com`
- Test mail sent from WooCommerce reaches customer inbox and avoids spam
