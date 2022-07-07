import {
  CacheNone,
  gql,
  type HydrogenApiRouteOptions,
  type HydrogenRequest,
} from '@shopify/hydrogen';

import {getApiErrorMessage} from '~/lib/utils';
import type {Address} from './index.server';

export async function api(
  request: HydrogenRequest,
  {params, session, queryShop}: HydrogenApiRouteOptions,
) {
  if (!session) {
    return new Response('Session storage not available.', {
      status: 400,
    });
  }

  const {customerAccessToken} = await session.get();

  if (!customerAccessToken) return new Response(null, {status: 401});

  if (request.method === 'PATCH')
    return updateAddress(customerAccessToken, request, params, queryShop);
  if (request.method === 'DELETE')
    return deleteAddress(customerAccessToken, params, queryShop);

  return new Response(null, {
    status: 405,
    headers: {
      Allow: 'PATCH,DELETE',
    },
  });
}

async function deleteAddress(
  customerAccessToken: string,
  params: HydrogenApiRouteOptions['params'],
  queryShop: HydrogenApiRouteOptions['queryShop'],
) {
  const {data, errors} = await queryShop<{
    customerAddressDelete: any;
  }>({
    query: DELETE_ADDRESS_MUTATION,
    variables: {
      customerAccessToken,
      id: decodeURIComponent(params.addressId),
    },
    // @ts-expect-error `queryShop.cache` is not yet supported but soon will be.
    cache: CacheNone(),
  });

  const error = getApiErrorMessage('customerAddressDelete', data, errors);

  if (error) return new Response(JSON.stringify({error}), {status: 400});

  return new Response(null);
}

async function updateAddress(
  customerAccessToken: string,
  request: HydrogenRequest,
  params: HydrogenApiRouteOptions['params'],
  queryShop: HydrogenApiRouteOptions['queryShop'],
) {
  const {
    firstName,
    lastName,
    company,
    address1,
    address2,
    country,
    province,
    city,
    zip,
    phone,
    isDefaultAddress,
  } = await request.json();

  const address: Address = {};

  if (firstName) address.firstName = firstName;
  if (lastName) address.lastName = lastName;
  if (company) address.company = company;
  if (address1) address.address1 = address1;
  if (address2) address.address2 = address2;
  if (country) address.country = country;
  if (province) address.province = province;
  if (city) address.city = city;
  if (zip) address.zip = zip;
  if (phone) address.phone = phone;

  const {data, errors} = await queryShop<{
    customerAddressUpdate: any;
  }>({
    query: UPDATE_ADDRESS_MUTATION,
    variables: {
      address,
      customerAccessToken,
      id: decodeURIComponent(params.addressId),
    },
    // @ts-expect-error `queryShop.cache` is not yet supported but soon will be.
    cache: CacheNone(),
  });

  const error = getApiErrorMessage('customerAddressUpdate', data, errors);

  if (error) return new Response(JSON.stringify({error}), {status: 400});

  if (isDefaultAddress) {
    const {data, errors} = await setDefaultAddress(
      queryShop,
      decodeURIComponent(params.addressId),
      customerAccessToken,
    );

    const error = getApiErrorMessage(
      'customerDefaultAddressUpdate',
      data,
      errors,
    );

    if (error) return new Response(JSON.stringify({error}), {status: 400});
  }

  return new Response(null);
}

export function setDefaultAddress(
  queryShop: HydrogenApiRouteOptions['queryShop'],
  addressId: string,
  customerAccessToken: string,
) {
  return queryShop<{
    customerDefaultAddressUpdate: any;
  }>({
    query: UPDATE_DEFAULT_ADDRESS_MUTATION,
    variables: {
      customerAccessToken,
      addressId,
    },
    // @ts-expect-error `queryShop.cache` is not yet supported but soon will be.
    cache: CacheNone(),
  });
}

const UPDATE_ADDRESS_MUTATION = gql`
  mutation customerAddressUpdate(
    $address: MailingAddressInput!
    $customerAccessToken: String!
    $id: ID!
  ) {
    customerAddressUpdate(
      address: $address
      customerAccessToken: $customerAccessToken
      id: $id
    ) {
      customerUserErrors {
        code
        field
        message
      }
    }
  }
`;

const UPDATE_DEFAULT_ADDRESS_MUTATION = gql`
  mutation customerDefaultAddressUpdate(
    $addressId: ID!
    $customerAccessToken: String!
  ) {
    customerDefaultAddressUpdate(
      addressId: $addressId
      customerAccessToken: $customerAccessToken
    ) {
      customerUserErrors {
        code
        field
        message
      }
    }
  }
`;

const DELETE_ADDRESS_MUTATION = gql`
  mutation customerAddressDelete($customerAccessToken: String!, $id: ID!) {
    customerAddressDelete(customerAccessToken: $customerAccessToken, id: $id) {
      customerUserErrors {
        code
        field
        message
      }
      deletedCustomerAddressId
    }
  }
`;
