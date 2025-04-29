# Why Vendor path-to-regexp

This package has a security vulnerability reported, but it does not affect how this package is used here.

Upgrading it to a non-vulnerable version (6.1.0 to 6.3.0) includes a breaking change in the generated regex. This change potentially causes behavioral change on the platform.

## Next.js

The same package is used in Next.js. Any change in either place needs to be reflected in the other place.
