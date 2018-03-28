# Can't Set `regions` and `scale` Options Simultaneously

#### Why This Error Occurred

Your deployment's configuration contains a `regions` and `scale`
configuration simultaneously.

#### Possible Ways to Fix It

The `regions` setting is intended to be used to scale the
deployment to the supplied regions or datacenters identifiers
with default scale settings.

```json
{
  "regions": ["sfo", "bru"]
}
```

The `scale` object allows you to be more granular: you can decide a
`min` and `max` number of instances per region:

```json
{
  "scale": {
    "sfo": { "min": 0, "max": 10 }
  }
}
```

To solve this problem, use only one of the two ways of deciding
where to scale your deployment to.
