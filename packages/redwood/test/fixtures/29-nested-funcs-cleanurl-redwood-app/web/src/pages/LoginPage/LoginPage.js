import { MetaTags } from '@redwoodjs/web'

const LoginPage = () => {
  return (
    <>
      <MetaTags title="Login" description="Login page" />

      <div>
        <div className="grid grid-cols-12">
          <div className="min-h-screen col-span-4 font-sans font-bold text-white bg-black pl-7">
            <div className="grid items-center min-h-screen grid-flow-col grid-rows-6 justify-items-start">
              <div className="row-span-4 row-start-2 text-4xl">
                Sign In
                <div className="pt-10 pr-20">
                  <label
                    htmlFor="username"
                    className="font-sans text-sm font-medium"
                  >
                    Username
                  </label>
                  <input
                    type="text"
                    name="username"
                    placeholder="Write your username"
                    className="w-full px-12 py-3 font-sans text-base bg-black border border-gray-500 rounded shadow hover:"
                  />
                </div>
                <div className="pt-2 pr-20">
                  <label
                    htmlFor="password"
                    className="font-sans text-sm font-medium"
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    name="password"
                    placeholder="Write your password"
                    className="w-full px-12 py-3 font-sans text-base bg-black border border-gray-500 rounded shadow hover:"
                  />
                  <a
                    href
                    className="font-sans text-sm font-medium text-gray-600 underline"
                  >
                    Forgot password?
                  </a>
                </div>
                {/* Button */}
                <div className="w-full pr-20 font-sans text-sm font-medium pt-14">
                  <button
                    type="button"
                    className="w-full py-4 text-center text-white bg-blue-700 rounded-md hover:bg-blue-400"
                  >
                    SIGN IN
                  </button>
                </div>
              </div>
              {/* Text */}
              <a
                href
                className="font-sans text-sm font-medium text-gray-400 underline"
              >
                Don´t have an account? Sign up
              </a>
            </div>
          </div>
          {/* Second column image */}
          <div className="col-span-8 font-sans font-bold text-white banner">
            {/* Aquí iría algún comentario */}
          </div>
        </div>
      </div>
    </>
  )
}

export default LoginPage
