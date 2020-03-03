# Domain Verification

#### Why This Error Occurred

The domain you supplied cannot be verified using the intended nameservers.

#### Possible Way to Fix It

Apply the intended set of nameservers to your domain.

You can retrieve the intended nameservers by running `now domains inspect <domain>`.

ZEIT will automatically check periodically that your domain has been verified and automatically mark it as such.

If you would not like to verify your domain, you can remove it from your account using `now domains rm <domain>`.

#### Resources

- [ZEIT Domains Documentation](https://zeit.co/docs/v2/domains-and-aliases/adding-a-domain/)
- [Zero-Downtime Domain Migration Guide](https://zeit.co/docs/v2/domains-and-aliases/zero-downtime-domain-migration/)
