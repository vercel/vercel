import open from 'open';
import Client from '../../util/client';

// Constants for the OAuth configuration
const APP_ID = '3kEj9zHcCLfuFwHOoYv-3WDlyHRYpenuDyl0sqFFg2w';
const REDIRECT_URI = 'https://www.contentful.com/developers/cli-oauth-page/';
const BASE_URL = 'https://be.contentful.com';

/**
 * Constructs the OAuth URL for Contentful login.
 * @param {string} [host] - Optional host to replace the default host in the URL.
 * @returns {string} The constructed OAuth URL.
 */
const getOauthURL = (): string => {
  return `${BASE_URL}/oauth/authorize?response_type=token&client_id=${APP_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&scope=content_management_manage`;
};

/**
 * Prompts the user to login to Contentful and paste the provided token.
 * @param {Client} client - The client object that facilitates user input.
 * @returns {Promise<string>} A promise that resolves to the user-provided token.
 */
export default async function doContentfulOAuthLogin(
  client: Client
): Promise<string> {
  const { output } = client;
  try {
    const contentfulAuthUrl = getOauthURL();

    // Open the default browser to initiate OAuth login
    await open(contentfulAuthUrl);
    output.log('Please complete the login in your browser.');

    // Prompt the user to enter the token received after login
    const token = await client.input.text({
      message: 'Paste the access token here:',
    });

    if (!token) {
      throw new Error('No token provided.');
    }

    return token;
  } catch (error) {
    output.error(`Failed to login to Contentful: ${error}`);
    throw error;
  }
}
