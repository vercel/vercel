// API endpoint to list accounts for a team
// GET /api/accounts/list?teamId=team_xxx&page=1&perPage=20&role=admin&status=active&search=john&sortBy=name&sortOrder=asc

import { VercelRequest, VercelResponse } from '@vercel/node';
import { withApiHandler } from '../_lib/util/with-api-handler';
import { listAccounts, getAccountStats } from '../_lib/accounts/account-info';
import { AccountFilters } from '../_lib/accounts/types';

export default withApiHandler(async function (
  req: VercelRequest,
  res: VercelResponse
) {
  const teamId = req.query.teamId as string;

  if (!teamId) {
    return res.status(400).json({
      error: {
        code: 'missing_team_id',
        message: 'The `teamId` parameter is required.',
      },
    });
  }

  // Parse pagination parameters
  const page = parseInt((req.query.page as string) || '1', 10);
  const perPage = parseInt((req.query.perPage as string) || '20', 10);

  if (page < 1 || perPage < 1 || perPage > 100) {
    return res.status(400).json({
      error: {
        code: 'invalid_pagination',
        message: 'Invalid pagination parameters. Page must be >= 1 and perPage must be between 1 and 100.',
      },
    });
  }

  // Parse filters
  const filters: AccountFilters = {
    role: req.query.role as string | undefined,
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    sortBy: (req.query.sortBy as any) || 'name',
    sortOrder: (req.query.sortOrder as any) || 'asc',
  };

  // Get accounts and stats
  const [{ accounts, total }, stats] = await Promise.all([
    listAccounts(teamId, filters, page, perPage),
    getAccountStats(teamId),
  ]);

  const hasMore = page * perPage < total;

  return res.status(200).json({
    accounts,
    pagination: {
      total,
      page,
      perPage,
      hasMore,
    },
    stats,
  });
});
