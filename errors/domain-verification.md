# Domain Verification

#### Why This Error Occurred

The domain you supplied cannot be verified using either the intended set of nameservers or the given verification TXT record.

#### Possible Ways to Fix It

Apply the intended set of nameservers to your domain or add the given TXT verification record through your domain provider.

You can retrieve both the intended nameservers and TXT verification record for the domain you wish to verify by running `vercel domains inspect <domain>`.

When you have added either verification method to your domain, you can run `vercel domains verify <domain>` again to complete verification for your domain.

Vercel will also automatically check periodically that your domain has been verified and automatically mark it as such if we detect either verification method on the domain.

If you would not like to verify your domain, you can remove it from your account using `vercel domains rm <domain>`.

#### Resources

- [Vercel Custom Domains Documentation](https://vercel.com/docs/v2/custom-domains)
