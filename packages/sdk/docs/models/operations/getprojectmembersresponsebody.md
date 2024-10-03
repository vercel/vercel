# GetProjectMembersResponseBody

Paginated list of members for the project.


## Supported Types

### `operations.GetProjectMembersResponseBody1`

```typescript
const value: operations.GetProjectMembersResponseBody1 = {};
```

### `operations.GetProjectMembersResponseBody2`

```typescript
const value: operations.GetProjectMembersResponseBody2 = {
  members: [
    {
      avatar: "123a6c5209bc3778245d011443644c8d27dc2c50",
      email: "jane.doe@example.com",
      role: "ADMIN",
      computedProjectRole: "ADMIN",
      uid: "zTuNVUXEAvvnNN3IaqinkyMw",
      username: "jane-doe",
      name: "Jane Doe",
      createdAt: 1588720733602,
      teamRole: "CONTRIBUTOR",
    },
  ],
  pagination: {
    hasNext: false,
    count: 20,
    next: 1540095775951,
    prev: 1540095775951,
  },
};
```

