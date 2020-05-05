# The DNS Configuration can't be verified

## Why This Error Occurred

When generating a certificate, we have to prove ownership over the domain
for the Certificate Authority (CA) that issues it. We also run some pretests
to make sure the DNS is properly configured before submitting the request to
the CA. This error means that these pretests did not succeed.

## How to Fix It

If your domain is pointing to Vercel DNS and you’re getting this error,
it could be that:

- The domain was acquired recently, and it might not be ready for use yet.
- Required DNS records have not propagated yet.

When running into this, ensure that your nameservers have configuration is correct. Also, if you bought the domain recently or have made changes, please be patient,
it might take a while for these to be ready.

If your domain is _not_ pointing to Vercel DNS and you’re getting this
error, you must ensure that you have an `ALIAS` and `CNAME` records in place.
Ensure also that you have disabled automatic redirects to `https` and ensure all changes were propagated.
