import {type ActionArgs, json, redirect} from '@shopify/remix-oxygen';
import {Form, useActionData, type V2_MetaFunction} from '@remix-run/react';

type ActionResponse = {
  error: string | null;
};

export const meta: V2_MetaFunction = () => {
  return [{title: 'Reset Password'}];
};

export async function action({request, context, params}: ActionArgs) {
  if (request.method !== 'POST') {
    return json({error: 'Method not allowed'}, {status: 405});
  }
  const {id, resetToken} = params;
  const {session, storefront} = context;

  try {
    if (!id || !resetToken) {
      throw new Error('customer token or id not found');
    }

    const form = await request.formData();
    const password = form.has('password') ? String(form.get('password')) : '';
    const passwordConfirm = form.has('passwordConfirm')
      ? String(form.get('passwordConfirm'))
      : '';
    const validInputs = Boolean(password && passwordConfirm);
    if (validInputs && password !== passwordConfirm) {
      throw new Error('Please provide matching passwords');
    }

    const {customerReset} = await storefront.mutate(CUSTOMER_RESET_MUTATION, {
      variables: {
        id: `gid://shopify/Customer/${id}`,
        input: {password, resetToken},
      },
    });

    if (customerReset?.customerUserErrors?.length) {
      throw new Error(customerReset?.customerUserErrors[0].message);
    }

    if (!customerReset?.customerAccessToken) {
      throw new Error('Access token not found. Please try again.');
    }
    session.set('customerAccessToken', customerReset.customerAccessToken);

    return redirect('/account', {
      headers: {
        'Set-Cookie': await session.commit(),
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      return json({error: error.message}, {status: 400});
    }
    return json({error}, {status: 400});
  }
}

export default function Reset() {
  const action = useActionData<ActionResponse>();

  return (
    <div className="account-reset">
      <h1>Reset Password.</h1>
      <p>Enter a new password for your account.</p>
      <Form method="POST">
        <fieldset>
          <label htmlFor="password">Password</label>
          <input
            aria-label="Password"
            autoComplete="current-password"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            id="password"
            minLength={8}
            name="password"
            placeholder="Password"
            required
            type="password"
          />
          <label htmlFor="passwordConfirm">Re-enter password</label>
          <input
            aria-label="Re-enter password"
            autoComplete="current-password"
            id="passwordConfirm"
            minLength={8}
            name="passwordConfirm"
            placeholder="Re-enter password"
            required
            type="password"
          />
        </fieldset>
        {action?.error ? (
          <p>
            <mark>
              <small>{action.error}</small>
            </mark>
          </p>
        ) : (
          <br />
        )}
        <button type="submit">Reset</button>
      </Form>
      <br />
      <p>
        <a href="/account/login">Back to login →</a>
      </p>
    </div>
  );
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/mutations/customerreset
const CUSTOMER_RESET_MUTATION = `#graphql
  mutation customerReset(
    $id: ID!,
    $input: CustomerResetInput!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
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
` as const;
