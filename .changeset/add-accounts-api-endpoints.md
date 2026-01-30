---
---

Add accounts API endpoints for admin team accounts page

This change adds three new API endpoints to support the team accounts page in the admin interface:

- `/api/accounts/list` - Lists all accounts for a team with filtering, sorting, and pagination
- `/api/accounts/info` - Gets detailed information about a specific account
- `/api/accounts/stats` - Provides statistics about accounts for a team

Features include:
- Account filtering by role (owner, admin, member, viewer) and status (active, invited, suspended)
- Search functionality for finding accounts by name or email
- Sorting by name, email, join date, or last activity
- Pagination support for large teams
- Account statistics dashboard data
- Mock data implementation for development/testing

The endpoints are designed to be consumed by the admin UI at `https://admin.vercel.com/team/{team_id}/accounts`.
