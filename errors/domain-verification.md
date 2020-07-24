# Domain Verification

#### Why This Error Occurred

The domain you supplied cannot be verified using the intended nameservers.

#### Possible Way to Fix It

Apply the intended set of nameservers to your domain.

You can retrieve both the intended nameservers and TXT verification record for the domain you wish to verify by running `vercel domains inspect <domain>`.

Vercel will also automatically check periodically that your domain has been verified and automatically mark it as such if we detect either verification method on the domain.

If you would not like to verify your domain, you can remove it from your account using `vercel domains rm <domain>`.

#### Resources

- [Vercel Custom Domains Documentation](https://vercel.com/docs/v2/custom-domains)
