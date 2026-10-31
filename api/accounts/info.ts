// API endpoint to get detailed account information
// GET /api/accounts/info?accountId=acc_xxx

import { VercelRequest, VercelResponse } from '@vercel/node';
import { withApiHandler } from '../_lib/util/with-api-handler';
import { getAccountInfo } from '../_lib/accounts/account-info';

export default withApiHandler(async function (
  req: VercelRequest,
  res: VercelResponse
) {
  const accountId = req.query.accountId as string;

  if (!accountId) {
    return res.status(400).json({
      error: {
        code: 'missing_account_id',
        message: 'The `accountId` parameter is required.',
      },
    });
  }

  const account = await getAccountInfo(accountId);

  if (!account) {
    return res.status(404).json({
      error: {
        code: 'account_not_found',
        message: `Account with ID "${accountId}" not found.`,
      },
    });
  }

  // Mock activity data - in production this would come from analytics
  const activity = {
    deployments: 42,
    projects: 8,
    lastDeploy: '2024-01-29T10:30:00.000Z',
  };

  // Mock teams data - in production this would come from database
  const teams = [
    {
      id: 'team_1',
      name: 'Engineering Team',
      role: account.role,
    },
  ];

  return res.status(200).json({
    account,
    activity,
    teams,
  });
});
