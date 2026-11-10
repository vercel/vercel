const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const env = {
  DATABASE_HOST: required('DATABASE_HOST', 'aws.connect.psdb.cloud'),
  DATABASE_USERNAME: required('DATABASE_USERNAME', 'fake-user'),
  DATABASE_PASSWORD: required('DATABASE_PASSWORD', 'fake-password'),
};

export default env;
