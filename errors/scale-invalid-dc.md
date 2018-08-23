# Invalid Region or DC Identifier

#### Why This Error Occurred

When supplying a region or DC identifier in `now scale`,
we weren't able to recognize the value as valid.

#### Possible Ways to Fix It

Check your `now scale` command make sure you are using a
valid string after the URL. Regions
and DCs have to be in *lowercase*.

**Valid region identifiers**:

- `all` (special, used to scale to all DCs, can only appear once)
- `sfo`
- `bru`
- `gru`

In `now-cli`, they currently are transformed to `sfo1`
and `bru1` dc identifiers before being sent to our APIs.

**Valid DC identifiers**:

- `sfo1`
- `bru1`
- `gru1`

To pass multiple ones, use a comma:

```
now scale my-url-123.now.sh sfo,bru,gru 1 5
```
