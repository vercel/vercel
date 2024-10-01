# CreateRecordRequestBody


## Supported Types

### `operations.RequestBody1`

```typescript
const value: operations.RequestBody1 = {
  name: "subdomain",
  type: "HTTPS",
  ttl: 60,
  value: "192.0.2.42",
  comment: "used to verify ownership of domain",
};
```

### `operations.RequestBody2`

```typescript
const value: operations.RequestBody2 = {
  name: "subdomain",
  type: "MX",
  ttl: 60,
  value: "2001:DB8::42",
  comment: "used to verify ownership of domain",
};
```

### `operations.RequestBody3`

```typescript
const value: operations.RequestBody3 = {
  name: "subdomain",
  type: "SRV",
  ttl: 60,
  value: "cname.vercel-dns.com",
  comment: "used to verify ownership of domain",
};
```

### `operations.RequestBody4`

```typescript
const value: operations.RequestBody4 = {
  name: "subdomain",
  type: "TXT",
  ttl: 60,
  value: "0 issue \\"letsencrypt.org\\"",
  comment: "used to verify ownership of domain",
};
```

### `operations.RequestBody5`

```typescript
const value: operations.RequestBody5 = {
  name: "subdomain",
  type: "NS",
  ttl: 60,
  value: "cname.vercel-dns.com",
  comment: "used to verify ownership of domain",
};
```

### `operations.Six`

```typescript
const value: operations.Six = {
  name: "subdomain",
  type: "MX",
  ttl: 60,
  value: "10 mail.example.com.",
  mxPriority: 10,
  comment: "used to verify ownership of domain",
};
```

### `operations.Seven`

```typescript
const value: operations.Seven = {
  name: "<value>",
  type: "TXT",
  ttl: 60,
  srv: {
    priority: 10,
    weight: 10,
    port: 5000,
    target: "host.example.com",
  },
  comment: "used to verify ownership of domain",
};
```

### `operations.Eight`

```typescript
const value: operations.Eight = {
  name: "<value>",
  type: "SRV",
  ttl: 60,
  value: "hello",
  comment: "used to verify ownership of domain",
};
```

### `operations.Nine`

```typescript
const value: operations.Nine = {
  name: "subdomain",
  type: "CAA",
  ttl: 60,
  value: "ns1.example.com",
  comment: "used to verify ownership of domain",
};
```

### `operations.Ten`

```typescript
const value: operations.Ten = {
  name: "<value>",
  type: "TXT",
  ttl: 60,
  https: {
    priority: 10,
    target: "host.example.com",
    params: "alpn=h2,h3",
  },
  comment: "used to verify ownership of domain",
};
```

