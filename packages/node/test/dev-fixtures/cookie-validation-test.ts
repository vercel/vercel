import type { VercelRequest, VercelResponse } from '../..';

export default (req: VercelRequest, res: VercelResponse) => {
  // Test endpoint that demonstrates cookie validation
  const cookieHeader = req.headers.cookie || '';
  const parsedCookies = req.cookies;
  
  res.json({
    cookieHeader,
    parsedCookies,
    cookieCount: Object.keys(parsedCookies).length,
    message: 'Cookie validation test endpoint'
  });
};