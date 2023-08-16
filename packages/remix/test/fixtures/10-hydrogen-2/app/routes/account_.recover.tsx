import {json, redirect, type LoaderArgs} from '@shopify/remix-oxygen';
import {Form, Link, useActionData} from '@remix-run/react';

type ActionResponse = {
  error?: string;
  resetRequested?: boolean;
};

export async function loader({context}: LoaderArgs) {
  const customerAccessToken = await context.session.get('customerAccessToken');
  if (customerAccessToken) {
    return redirect('/account');
  }

  return json({});
}

export async function action({request, context}: LoaderArgs) {
  const {storefront} = context;
  const form = await request.formData();
  const email = form.has('email') ? String(form.get('email')) : null;

  if (request.method !== 'POST') {
    return json({error: 'Method not allowed'}, {status: 405});
  }

  try {
    if (!email) {
      throw new Error('Please provide an email.');
    }
    await storefront.mutate(CUSTOMER_RECOVER_MUTATION, {
      variables: {email},
    });

    return json({resetRequested: true});
  } catch (error: unknown) {
    const resetRequested = false;
    if (error instanceof Error) {
      return json({error: error.message, resetRequested}, {status: 400});
    }
    return json({error, resetRequested}, {status: 400});
  }
}

export default function Recover() {
  const action = useActionData<ActionResponse>();

  return (
    <div className="account-recover">
      <div>
        {action?.resetRequested ? (
          <>
            <h1>Request Sent.</h1>
            <p>
              If that email address is in our system, you will receive an email
              with instructions about how to reset your password in a few
              minutes.
            </p>
            <br />
            <Link to="/account/login">Return to Login</Link>
          </>
        ) : (
          <>
            <h1>Forgot Password.</h1>
            <p>
              Enter the email address associated with your account to receive a
              link to reset your password.
            </p>
            <br />
            <Form method="POST">
              <fieldset>
                <label htmlFor="email">Email</label>
                <input
                  aria-label="Email address"
                  autoComplete="email"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  id="email"
                  name="email"
                  placeholder="Email address"
                  required
                  type="email"
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
              <button type="submit">Request Reset Link</button>
            </Form>
            <div>
              <br />
              <p>
                <Link to="/account/login">Login →</Link>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/mutations/customerrecover
const CUSTOMER_RECOVER_MUTATION = `#graphql
  mutation customerRecover(
    $email: String!,
    $country: CountryCode,
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    customerRecover(email: $email) {
      customerUserErrors {
        code
        field
        message
      }
    }
  }
` as const;
