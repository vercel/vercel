# Invalid Region or DC Identifier

#### Why This Error Occurred

When supplying `regions` or `scale` settings, you
used an unknown or invalid dc identifier.

#### Possible Ways to Fix It

Check your `now.json` or `--regions` flag and
make sure you are using a valid string. Regions
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

When passing multiple `--regions` as a CLI parameter,
make sure they're separated by a comma (`,`). For example:

```console
now --regions sfo,bru,gru
```
