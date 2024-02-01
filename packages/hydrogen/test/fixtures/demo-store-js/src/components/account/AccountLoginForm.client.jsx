import {useState} from 'react';
import {useNavigate, Link} from '@shopify/hydrogen/client';

export function AccountLoginForm({shopName}) {
  const navigate = useNavigate();

  const [hasSubmitError, setHasSubmitError] = useState(false);
  const [showEmailField, setShowEmailField] = useState(true);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(null);

  function onSubmit(event) {
    event.preventDefault();

    setEmailError(null);
    setHasSubmitError(false);
    setPasswordError(null);

    if (showEmailField) {
      checkEmail(event);
    } else {
      checkPassword(event);
    }
  }

  function checkEmail(event) {
    if (event.currentTarget.email.validity.valid) {
      setShowEmailField(false);
    } else {
      setEmailError('Please enter a valid email');
    }
  }

  async function checkPassword(event) {
    const validity = event.currentTarget.password.validity;
    if (validity.valid) {
      const response = await callLoginApi({
        email,
        password,
      });

      if (response.error) {
        setHasSubmitError(true);
        resetForm();
      } else {
        navigate('/account');
      }
    } else {
      setPasswordError(
        validity.valueMissing
          ? 'Please enter a password'
          : 'Passwords must be at least 6 characters',
      );
    }
  }

  function resetForm() {
    setShowEmailField(true);
    setEmail('');
    setEmailError(null);
    setPassword('');
    setPasswordError(null);
  }

  return (
    <div className="flex justify-center my-24 px-4">
      <div className="max-w-md w-full">
        <h1 className="text-4xl">Sign in.</h1>
        <form noValidate className="pt-6 pb-8 mt-4 mb-4" onSubmit={onSubmit}>
          {hasSubmitError && (
            <div className="flex items-center justify-center mb-6 bg-zinc-500">
              <p className="m-4 text-s text-contrast">
                Sorry we did not recognize either your email or password. Please
                try to sign in again or create a new account.
              </p>
            </div>
          )}
          {showEmailField && (
            <EmailField
              shopName={shopName}
              email={email}
              setEmail={setEmail}
              emailError={emailError}
            />
          )}
          {!showEmailField && (
            <ValidEmail email={email} resetForm={resetForm} />
          )}
          {!showEmailField && (
            <PasswordField
              password={password}
              setPassword={setPassword}
              passwordError={passwordError}
            />
          )}
        </form>
      </div>
    </div>
  );
}

export async function callLoginApi({email, password}) {
  try {
    const res = await fetch(`/account/login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({email, password}),
    });
    if (res.ok) {
      return {};
    } else {
      return res.json();
    }
  } catch (error) {
    return {
      error: error.toString(),
    };
  }
}

function EmailField({email, setEmail, emailError, shopName}) {
  return (
    <>
      <div className="mb-3">
        <input
          className={`mb-1 appearance-none rounded border w-full py-2 px-3 text-primary/90 placeholder:text-primary/50 leading-tight focus:shadow-outline ${
            emailError ? ' border-red-500' : 'border-gray-900'
          }`}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="Email address"
          aria-label="Email address"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
        {!emailError ? (
          ''
        ) : (
          <p className={`text-red-500 text-xs`}>{emailError} &nbsp;</p>
        )}
      </div>
      <div className="flex items-center justify-between">
        <button
          className="bg-gray-900 rounded text-contrast py-2 px-4 focus:shadow-outline block w-full"
          type="submit"
        >
          Next
        </button>
      </div>
      <div className="flex items-center mt-8 border-t  border-gray-300">
        <p className="align-baseline text-sm mt-6">
          New to {shopName}? &nbsp;
          <Link className="inline underline" to="/account/register">
            Create an account
          </Link>
        </p>
      </div>
    </>
  );
}

function ValidEmail({email, resetForm}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div>
        <p>{email}</p>
        <input
          className="hidden"
          type="text"
          autoComplete="username"
          value={email}
          readOnly
        ></input>
      </div>
      <div>
        <button
          className="inline-block align-baseline text-sm underline"
          type="button"
          onClick={resetForm}
        >
          Change email
        </button>
      </div>
    </div>
  );
}

function PasswordField({password, setPassword, passwordError}) {
  return (
    <>
      <div className="mb-3">
        <input
          className={`mb-1 appearance-none rounded border w-full py-2 px-3 text-primary/90 placeholder:text-primary/50 leading-tight focus:shadow-outline ${
            passwordError ? ' border-red-500' : 'border-gray-900'
          }`}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          value={password}
          minLength={8}
          required
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        {!passwordError ? (
          ''
        ) : (
          <p className={`text-red-500 text-xs`}> {passwordError} &nbsp;</p>
        )}
      </div>
      <div className="flex items-center justify-between">
        <button
          className="bg-gray-900 text-contrast rounded py-2 px-4 focus:shadow-outline block w-full"
          type="submit"
        >
          Sign in
        </button>
      </div>
      <div className="flex items-center justify-between mt-4">
        <div className="flex-1"></div>
        <Link
          className="inline-block align-baseline text-sm text-primary/50"
          to="/account/recover"
        >
          Forgot password
        </Link>
      </div>
    </>
  );
}
