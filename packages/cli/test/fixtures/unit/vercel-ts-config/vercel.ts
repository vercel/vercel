import { createRouter } from '@vercel/router-sdk';

const router = createRouter();

router.redirect('/old-page', '/new-page', { permanent: true });

router.cacheControl('/static/(.*)', {
  public: true,
  maxAge: '1week'
});

router.setCleanUrls(true);
router.setTrailingSlash(true);

export default router.getConfig();

