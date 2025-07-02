export const config = {
  runtime: 'nodejs18.x',
  experimentalTriggers: [
    {
      triggerVersion: 1,
      specversion: '1.0',
      type: 'v1.test.vercel.com',
      httpBinding: {
        mode: 'structured',
        method: 'POST',
        pathname: '/webhooks/test'
      }
    },
    {
      triggerVersion: 1,
      specversion: '1.0',
      type: 'com.vercel.queue.v1',
      httpBinding: {
        mode: 'structured',
        method: 'POST'
      },
      queue: {
        topic: 'user-events',
        consumer: 'webhook-processor',
        maxAttempts: 3,
        retryAfterSeconds: 10,
        initialDelaySeconds: 0
      }
    }
  ]
};

export default function (req, res) {
  res.end('Handler with experimental triggers');
}
