import { Account, AccountFilters } from './types';

/**
 * Mock function to get account information
 * In production, this would query a database or call an internal API
 */
export async function getAccountInfo(accountId: string): Promise<Account | null> {
  // This is a mock implementation
  // In a real scenario, this would fetch from a database
  const mockAccounts: Record<string, Account> = {
    'acc_1': {
      id: 'acc_1',
      name: 'John Doe',
      email: 'john.doe@example.com',
      role: 'owner',
      status: 'active',
      joinedAt: '2023-01-15T00:00:00.000Z',
      lastActiveAt: '2024-01-29T12:00:00.000Z',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
      permissions: ['read', 'write', 'admin'],
    },
    'acc_2': {
      id: 'acc_2',
      name: 'Jane Smith',
      email: 'jane.smith@example.com',
      role: 'admin',
      status: 'active',
      joinedAt: '2023-03-20T00:00:00.000Z',
      lastActiveAt: '2024-01-28T15:30:00.000Z',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jane',
      permissions: ['read', 'write'],
    },
  };

  return mockAccounts[accountId] || null;
}

/**
 * Mock function to list accounts for a team
 * In production, this would query a database or call an internal API
 */
export async function listAccounts(
  teamId: string,
  filters?: AccountFilters,
  page = 1,
  perPage = 20
): Promise<{ accounts: Account[]; total: number }> {
  // Mock accounts data
  const allAccounts: Account[] = [
    {
      id: 'acc_1',
      name: 'John Doe',
      email: 'john.doe@example.com',
      role: 'owner',
      status: 'active',
      joinedAt: '2023-01-15T00:00:00.000Z',
      lastActiveAt: '2024-01-29T12:00:00.000Z',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
      permissions: ['read', 'write', 'admin'],
    },
    {
      id: 'acc_2',
      name: 'Jane Smith',
      email: 'jane.smith@example.com',
      role: 'admin',
      status: 'active',
      joinedAt: '2023-03-20T00:00:00.000Z',
      lastActiveAt: '2024-01-28T15:30:00.000Z',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jane',
      permissions: ['read', 'write'],
    },
    {
      id: 'acc_3',
      name: 'Bob Johnson',
      email: 'bob.johnson@example.com',
      role: 'member',
      status: 'active',
      joinedAt: '2023-06-10T00:00:00.000Z',
      lastActiveAt: '2024-01-25T09:15:00.000Z',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob',
      permissions: ['read'],
    },
    {
      id: 'acc_4',
      name: 'Alice Williams',
      email: 'alice.williams@example.com',
      role: 'member',
      status: 'invited',
      joinedAt: '2024-01-20T00:00:00.000Z',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice',
      permissions: ['read'],
    },
    {
      id: 'acc_5',
      name: 'Charlie Brown',
      email: 'charlie.brown@example.com',
      role: 'viewer',
      status: 'active',
      joinedAt: '2023-09-05T00:00:00.000Z',
      lastActiveAt: '2024-01-20T14:45:00.000Z',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie',
      permissions: ['read'],
    },
  ];

  let filteredAccounts = [...allAccounts];

  // Apply filters
  if (filters) {
    if (filters.role) {
      filteredAccounts = filteredAccounts.filter(
        acc => acc.role === filters.role
      );
    }
    if (filters.status) {
      filteredAccounts = filteredAccounts.filter(
        acc => acc.status === filters.status
      );
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      filteredAccounts = filteredAccounts.filter(
        acc =>
          acc.name.toLowerCase().includes(search) ||
          acc.email.toLowerCase().includes(search)
      );
    }

    // Apply sorting
    if (filters.sortBy) {
      const sortOrder = filters.sortOrder === 'desc' ? -1 : 1;
      filteredAccounts.sort((a, b) => {
        const aVal = a[filters.sortBy!];
        const bVal = b[filters.sortBy!];
        if (aVal === undefined && bVal === undefined) return 0;
        if (aVal === undefined) return 1;
        if (bVal === undefined) return -1;
        if (aVal < bVal) return -1 * sortOrder;
        if (aVal > bVal) return 1 * sortOrder;
        return 0;
      });
    }
  }

  const total = filteredAccounts.length;
  const startIndex = (page - 1) * perPage;
  const paginatedAccounts = filteredAccounts.slice(
    startIndex,
    startIndex + perPage
  );

  return {
    accounts: paginatedAccounts,
    total,
  };
}

/**
 * Get account statistics for a team
 */
export async function getAccountStats(_teamId: string) {
  return {
    total: 5,
    active: 4,
    invited: 1,
    suspended: 0,
    byRole: {
      owner: 1,
      admin: 1,
      member: 2,
      viewer: 1,
    },
  };
}
