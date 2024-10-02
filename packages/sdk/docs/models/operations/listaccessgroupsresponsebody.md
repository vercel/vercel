# ListAccessGroupsResponseBody


## Supported Types

### `operations.ListAccessGroupsResponseBody1`

```typescript
const value: operations.ListAccessGroupsResponseBody1 = {};
```

### `operations.ListAccessGroupsResponseBody2`

```typescript
const value: operations.ListAccessGroupsResponseBody2 = {
  accessGroups: [
    {
      isDsyncManaged: false,
      name: "my-access-group",
      createdAt: "1588720733602",
      teamId: "team_123a6c5209bc3778245d011443644c8d27dc2c50",
      updatedAt: "1588720733602",
      accessGroupId: "ag_123a6c5209bc3778245d011443644c8d27dc2c50",
      membersCount: 5,
      projectsCount: 2,
    },
  ],
  pagination: {
    count: 602.25,
    next: "<value>",
  },
};
```

