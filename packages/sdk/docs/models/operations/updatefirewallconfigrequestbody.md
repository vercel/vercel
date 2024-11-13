# UpdateFirewallConfigRequestBody


## Supported Types

### `operations.UpdateFirewallConfigRequestBody1`

```typescript
const value: operations.UpdateFirewallConfigRequestBody1 = {
  action: "firewallEnabled",
  value: false,
};
```

### `operations.UpdateFirewallConfigRequestBody2`

```typescript
const value: operations.UpdateFirewallConfigRequestBody2 = {
  action: "rules.insert",
  value: {
    name: "<value>",
    active: false,
    conditionGroup: [
      {
        conditions: [
          {
            type: "path",
            op: "ex",
          },
        ],
      },
    ],
    action: {},
  },
};
```

### `operations.UpdateFirewallConfigRequestBody3`

```typescript
const value: operations.UpdateFirewallConfigRequestBody3 = {
  action: "rules.update",
  id: "<id>",
  value: {
    name: "<value>",
    active: false,
    conditionGroup: [
      {
        conditions: [
          {
            type: "scheme",
            op: "ex",
          },
        ],
      },
    ],
    action: {},
  },
};
```

### `operations.UpdateFirewallConfigRequestBody4`

```typescript
const value: operations.UpdateFirewallConfigRequestBody4 = {
  action: "rules.remove",
  id: "<id>",
};
```

### `operations.UpdateFirewallConfigRequestBody5`

```typescript
const value: operations.UpdateFirewallConfigRequestBody5 = {
  action: "rules.priority",
  id: "<id>",
  value: 8766.82,
};
```

### `operations.RequestBody6`

```typescript
const value: operations.RequestBody6 = {
  action: "crs.update",
  id: "rfi",
  value: {
    active: false,
    action: "log",
  },
};
```

### `operations.RequestBody7`

```typescript
const value: operations.RequestBody7 = {
  action: "crs.disable",
};
```

### `operations.RequestBody8`

```typescript
const value: operations.RequestBody8 = {
  action: "ip.insert",
  value: {
    hostname: "wise-hyphenation.biz",
    ip: "198.69.97.122",
    action: "log",
  },
};
```

### `operations.RequestBody9`

```typescript
const value: operations.RequestBody9 = {
  action: "ip.update",
  id: "<id>",
  value: {
    hostname: "yummy-department.info",
    ip: "92.25.92.227",
    action: "challenge",
  },
};
```

### `operations.RequestBody10`

```typescript
const value: operations.RequestBody10 = {
  action: "ip.remove",
  id: "<id>",
};
```

### `operations.Eleven`

```typescript
const value: operations.Eleven = {
  action: "managedRules.update",
  id: "owasp",
  value: {
    active: false,
  },
};
```

