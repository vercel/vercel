import {CacheNone, gql} from '@shopify/hydrogen';
import {getApiErrorMessage} from '~/lib/utils';

/**
 * This API route is used by the form on `/account/reset/[id]/[resetToken]`
 * complete the reset of the user's password.
 */
export async function api(request, {session, queryShop}) {
  if (!session) {
    return new Response('Session storage not available.', {
      status: 400,
    });
  }

  const jsonBody = await request.json();

  if (
    !jsonBody.id ||
    jsonBody.id === '' ||
    !jsonBody.password ||
    jsonBody.password === '' ||
    !jsonBody.resetToken ||
    jsonBody.resetToken === ''
  ) {
    return new Response(
      JSON.stringify({error: 'Incorrect password or reset token.'}),
      {
        status: 400,
      },
    );
  }

  const {data, errors} = await queryShop({
    query: CUSTOMER_RESET_MUTATION,
    variables: {
      id: `gid://shopify/Customer/${jsonBody.id}`,
      input: {
        password: jsonBody.password,
        resetToken: jsonBody.resetToken,
      },
    },
    // @ts-expect-error `queryShop.cache` is not yet supported but soon will be.
    cache: CacheNone(),
  });

  if (data?.customerReset?.customerAccessToken?.accessToken) {
    await session.set(
      'customerAccessToken',
      data.customerReset.customerAccessToken.accessToken,
    );

    return new Response(null, {
      status: 200,
    });
  } else {
    return new Response(
      JSON.stringify({
        error: getApiErrorMessage('customerReset', data, errors),
      }),
      {status: 401},
    );
  }
}

const CUSTOMER_RESET_MUTATION = gql`
  mutation customerReset($id: ID!, $input: CustomerResetInput!) {
    customerReset(id: $id, input: $input) {
      customerAccessToken {
        accessToken
        expiresAt
      }
      customerUserErrors {
        code
        field
        message
      }
    }
  }
`;
