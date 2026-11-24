// API endpoint to get account statistics for a team
// GET /api/accounts/stats?teamId=team_xxx

import { VercelRequest, VercelResponse } from '@vercel/node';
import { withApiHandler } from '../_lib/util/with-api-handler';
import { getAccountStats } from '../_lib/accounts/account-info';

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

  const stats = await getAccountStats(teamId);

  return res.status(200).json(stats);
});
