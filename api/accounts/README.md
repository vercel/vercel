# Accounts API Endpoints

This directory contains API endpoints for managing team accounts in the Vercel admin interface.

## Endpoints

### 1. List Accounts

**Endpoint:** `GET /api/accounts/list`

Lists all accounts for a given team with filtering, sorting, and pagination.

**Query Parameters:**

- `teamId` (required): The team ID
- `page` (optional): Page number (default: 1)
- `perPage` (optional): Items per page (default: 20, max: 100)
- `role` (optional): Filter by role (`owner`, `admin`, `member`, `viewer`)
- `status` (optional): Filter by status (`active`, `invited`, `suspended`)
- `search` (optional): Search by name or email
- `sortBy` (optional): Sort field (`name`, `email`, `joinedAt`, `lastActiveAt`)
- `sortOrder` (optional): Sort order (`asc`, `desc`)

**Example Request:**

```
GET /api/accounts/list?teamId=team_nLlpyC6REAqxydlFKbrMDlud&page=1&perPage=20&role=admin&sortBy=name&sortOrder=asc
```

**Example Response:**

```json
{
  "accounts": [
    {
      "id": "acc_1",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "role": "owner",
      "status": "active",
      "joinedAt": "2023-01-15T00:00:00.000Z",
      "lastActiveAt": "2024-01-29T12:00:00.000Z",
      "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=John",
      "permissions": ["read", "write", "admin"]
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "perPage": 20,
    "hasMore": false
  },
  "stats": {
    "total": 5,
    "active": 4,
    "invited": 1,
    "suspended": 0,
    "byRole": {
      "owner": 1,
      "admin": 1,
      "member": 2,
      "viewer": 1
    }
  }
}
```

### 2. Account Info

**Endpoint:** `GET /api/accounts/info`

Get detailed information about a specific account.

**Query Parameters:**

- `accountId` (required): The account ID

**Example Request:**

```
GET /api/accounts/info?accountId=acc_1
```

**Example Response:**

```json
{
  "account": {
    "id": "acc_1",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "role": "owner",
    "status": "active",
    "joinedAt": "2023-01-15T00:00:00.000Z",
    "lastActiveAt": "2024-01-29T12:00:00.000Z",
    "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=John",
    "permissions": ["read", "write", "admin"]
  },
  "activity": {
    "deployments": 42,
    "projects": 8,
    "lastDeploy": "2024-01-29T10:30:00.000Z"
  },
  "teams": [
    {
      "id": "team_1",
      "name": "Engineering Team",
      "role": "owner"
    }
  ]
}
```

### 3. Account Stats

**Endpoint:** `GET /api/accounts/stats`

Get statistics about accounts for a team.

**Query Parameters:**

- `teamId` (required): The team ID

**Example Request:**

```
GET /api/accounts/stats?teamId=team_nLlpyC6REAqxydlFKbrMDlud
```

**Example Response:**

```json
{
  "total": 5,
  "active": 4,
  "invited": 1,
  "suspended": 0,
  "byRole": {
    "owner": 1,
    "admin": 1,
    "member": 2,
    "viewer": 1
  }
}
```

## Data Models

### Account

```typescript
interface Account {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'active' | 'invited' | 'suspended';
  joinedAt: string;
  lastActiveAt?: string;
  avatar?: string;
  permissions?: string[];
}
```

## Implementation Notes

The current implementation uses mock data for demonstration purposes. In a production environment, these endpoints should:

1. Authenticate requests and verify team membership
2. Query a database for account information
3. Implement proper error handling and logging
4. Add rate limiting
5. Cache frequently accessed data
6. Support real-time updates for account status changes

## Integration with Admin UI

These endpoints are designed to be consumed by the admin UI at:

```
https://admin.vercel.com/team/{team_id}/accounts
```

The UI should:

- Display a table of accounts with filtering and sorting
- Show account statistics in a dashboard
- Allow clicking on accounts to view detailed information
- Support search functionality
- Handle pagination for large teams
