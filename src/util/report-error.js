export default async (sentry, error) => {
  if (!error.userError) {
    sentry.captureException(error);
  }

  const client = sentry.getCurrentHub().getClient();

  // Ensure all Sentry events are flushed
  if (client) {
    await client.close();
  }
};
