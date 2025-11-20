import { VercelConfig, createRouter } from '@vercel/config/v1';

const router = createRouter();

export const config: VercelConfig = {
  rewrites: [
    router.rewrite('/api/posts/(.*)', `https://jsonplaceholder.typicode.com/posts/$1`),

    router.rewrite('/users/:userId', 'https://jsonplaceholder.typicode.com/users/$1'),

    router.rewrite('/gh/(.*)', 'https://api.github.com/$1'),

    router.rewrite('/http/(.*)', 'https://httpbin.org/$1')
  ],

  headers: [
    router.cacheControl('/static/(.*)', {
      public: true,
      maxAge: '1week',
      immutable: true
    }),
  ],

  redirects: [
    router.redirect('/old-blog', '/blog'),
    router.redirect('/home', '/'),
    router.redirect('/region', `https://${process.env.REGION}-staging.example.com`),
    
    router.redirect('/posts/:slug', '/blog?post=$1'),
    
    router.redirect('/legacy', '/', () => ({
      permanent: true
    })),
    
    router.redirect('/docs', 'https://vercel.com/docs'),
    router.redirect('/github', 'https://github.com/vercel/vercel'),
    router.redirect('/dash', process.env.NODE_ENV === 'production' ? 'https://vercel.com' : 'https://dash.vercel.com')
  ],

  build: {
    env: {
      "VERCEL_DEBUG": process.env.NODE_ENV === 'production' ? "0" : "1",
    }
  },
  
};