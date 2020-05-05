# DNS Challenges must be solved manually

## Why This Error Occurred

When generating a certificate, we have to prove ownership over the domain
for the Certificate Authority (CA) that issues it. In the case of Wildcard Certificates,
the requested challenge consists of adding TXT DNS records so, when the domain does not
point to Vercel DNS, we cannot create the records to solve the challenge.

## How to Fix It

To generate a certificate solving challenges manually, you must add the given `TXT` records with
the appropriate name to your DNS. Then, after verifying that the CA can read the records,
you can rerun the issuance command.

In case you want to start issuing a certificate to get the records you have to add or to
get those records again in the console, You can run the issuance command including the
`--challenge-only` option. This way the CLI will output the challenges information and,
after adding those records, you can rerun the command without `--challenge-only` to finish
issuance.
