# Invalid Region or DC Identifier

#### Why This Error Occurred

When supplying `regions` configuration, you
used an unknown or invalid DC identifier.

#### Possible Ways to Fix It

Check your `vercel.json` or `--regions` flag and
make sure you are using a valid string. Regions
and DCs have to be in _lowercase_.

**Valid region identifiers**:

- `all` (special, used to scale to all DCs, can only appear once)
- `sfo`
- `bru`
- `gru`
- `iad`

In Vercel CLI, they currently are transformed to
DC identifiers before being sent to our APIs.

**Valid DC identifiers**:

- `sfo1`
- `bru1`
- `gru1`
- `iad1`

When passing multiple `--regions` as a CLI parameter,
make sure they're separated by a comma (`,`). For example:

```console
vercel --regions sfo,bru,gru
```
