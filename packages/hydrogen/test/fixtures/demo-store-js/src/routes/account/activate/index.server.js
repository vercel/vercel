import {CacheNone, gql} from '@shopify/hydrogen';

import {getApiErrorMessage} from '~/lib/utils';

/**
 * This API route is used by the form on `/account/activate/[id]/[activationToken]`
 * complete the reset of the user's password.
 */
export async function api(request, {session, queryShop}) {
  if (!session) {
    return new Response('Session storage not available.', {
      status: 400,
    });
  }

  const jsonBody = await request.json();

  if (!jsonBody?.id || !jsonBody?.password || !jsonBody?.activationToken) {
    return new Response(
      JSON.stringify({error: 'Incorrect password or activation token.'}),
      {
        status: 400,
      },
    );
  }

  const {data, errors} = await queryShop({
    query: CUSTOMER_ACTIVATE_MUTATION,
    variables: {
      id: `gid://shopify/Customer/${jsonBody.id}`,
      input: {
        password: jsonBody.password,
        activationToken: jsonBody.activationToken,
      },
    },
    // @ts-expect-error `queryShop.cache` is not yet supported but soon will be.
    cache: CacheNone(),
  });

  if (data?.customerActivate?.customerAccessToken?.accessToken) {
    await session.set(
      'customerAccessToken',
      data.customerActivate.customerAccessToken.accessToken,
    );

    return new Response(null, {
      status: 200,
    });
  } else {
    return new Response(
      JSON.stringify({
        error: getApiErrorMessage('customerActivate', data, errors),
      }),
      {status: 401},
    );
  }
}

const CUSTOMER_ACTIVATE_MUTATION = gql`
  mutation customerActivate($id: ID!, $input: CustomerActivateInput!) {
    customerActivate(id: $id, input: $input) {
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
