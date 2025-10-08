# The DNS Challenge Could Not Be Solved

## Why This Error Occurred

When generating a certificate, we have to prove ownership over the domain
for the Certificate Authority (CA) that issues it. This error means that
the provider couldn’t solve the requested challenges.

## How to Fix It

If your domain is pointing to Vercel DNS and you’re getting this error,
it could be that:

- The domain was acquired recently, and it might not be ready for use yet.
- Required DNS records have not propagated yet.

When running into this, ensure that your nameservers are configured correctly. Also, if you bought the domain recently or have made changes, please be patient,
it might take a while for these to be ready.

If your domain is _not_ pointing to Vercel DNS and you’re getting this
error, the following methods could help:

- When solving challenges _manually_, ensure that the TXT
  records required to solve the challenges exist and are propagated. You can do so by querying the nameservers with `nslookup -q=TXT _acme-challenge.domain.com` depending on the Common Names you want for your certificate.

- If you are not solving the challenges manually you must ensure that you have an
  `ALIAS` and `CNAME` records in place. Ensure also that you have disabled automatic redirects to `https` and ensure all changes were propagated.
