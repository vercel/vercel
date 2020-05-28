# Invalid Region or DC Identifier

#### Why This Error Occurred

When supplying a region or DC identifier in `vercel scale`,
we weren't able to recognize the value as valid.

#### Possible Ways to Fix It

Check your `vercel scale` command make sure you are using a
valid string after the URL. Regions
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

To pass multiple ones, use a comma:

```
vercel scale my-url-123.now.sh sfo,bru,gru 1 5
```
