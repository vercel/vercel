import {useState} from 'react';
import {useNavigate} from '@shopify/hydrogen/client';

export function AccountActivateForm({id, activationToken}) {
  const navigate = useNavigate();

  const [submitError, setSubmitError] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(null);
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordConfirmError, setPasswordConfirmError] = useState(null);

  function passwordValidation(form) {
    setPasswordError(null);
    setPasswordConfirmError(null);

    let hasError = false;

    if (!form.password.validity.valid) {
      hasError = true;
      setPasswordError(
        form.password.validity.valueMissing
          ? 'Please enter a password'
          : 'Passwords must be at least 6 characters',
      );
    }

    if (!form.passwordConfirm.validity.valid) {
      hasError = true;
      setPasswordConfirmError(
        form.password.validity.valueMissing
          ? 'Please re-enter a password'
          : 'Passwords must be at least 6 characters',
      );
    }

    if (password !== passwordConfirm) {
      hasError = true;
      setPasswordConfirmError('The two passwords entered did not match.');
    }

    return hasError;
  }

  async function onSubmit(event) {
    event.preventDefault();

    if (passwordValidation(event.currentTarget)) {
      return;
    }

    const response = await callActivateApi({
      id,
      activationToken,
      password,
    });

    if (response.error) {
      setSubmitError(response.error);
      return;
    }

    navigate('/account');
  }

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-md">
        <h1 className="text-4xl">Activate Account.</h1>
        <p className="mt-4">Create your password to activate your account.</p>
        <form noValidate className="pt-6 pb-8 mt-4 mb-4" onSubmit={onSubmit}>
          {submitError && (
            <div className="flex items-center justify-center mb-6 bg-primary/30">
              <p className="m-4 text-s text-contrast">{submitError}</p>
            </div>
          )}
          <div className="mb-4">
            <input
              className={`mb-1 appearance-none border w-full py-2 px-3 text-primary placeholder:text-primary/30 leading-tight focus:shadow-outline ${
                passwordError ? ' border-notice' : 'border-primary'
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
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
            <p
              className={`text-red-500 text-xs ${
                !passwordError ? 'invisible' : ''
              }`}
            >
              {passwordError} &nbsp;
            </p>
          </div>
          <div className="mb-4">
            <input
              className={`mb-1 appearance-none border w-full py-2 px-3 text-primary/90 placeholder:text-primary/50 leading-tight focus:shadow-outline ${
                passwordConfirmError ? ' border-red-500' : 'border-gray-900'
              }`}
              id="passwordConfirm"
              name="passwordConfirm"
              type="password"
              autoComplete="current-password"
              placeholder="Re-enter password"
              aria-label="Re-enter password"
              value={passwordConfirm}
              required
              minLength={8}
              onChange={(event) => {
                setPasswordConfirm(event.target.value);
              }}
            />
            <p
              className={`text-red-500 text-xs ${
                !passwordConfirmError ? 'invisible' : ''
              }`}
            >
              {passwordConfirmError} &nbsp;
            </p>
          </div>
          <div className="flex items-center justify-between">
            <button
              className="block w-full px-4 py-2 text-contrast uppercase bg-gray-900 focus:shadow-outline"
              type="submit"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

async function callActivateApi({id, activationToken, password}) {
  try {
    const res = await fetch(`/account/activate`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({id, activationToken, password}),
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
