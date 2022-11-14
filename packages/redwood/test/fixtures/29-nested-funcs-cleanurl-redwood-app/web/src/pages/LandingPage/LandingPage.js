import { MetaTags } from '@redwoodjs/web'

const LandingPage = () => {
  return (
    <>
      <MetaTags title="Landing" description="Landing page" />

      <div className="container h-screen mx-auto">
        <div className="px-3 text-center lg:px-0">
          <h1 className="my-4 text-2xl font-black leading-tight md:text-3xl lg:text-5xl">
            Main Hero Message to sell yourself!
          </h1>
          <p className="mb-8 text-base leading-normal text-gray-800 md:text-xl lg:text-2xl">
            Sub-hero message, not too long and not too short. Make it just
            right!
          </p>

          <button className="w-48 px-8 py-4 mx-auto my-2 font-extrabold text-gray-800 rounded shadow-lg lg:mx-0 hover:underline md:my-6">
            Sign Up
          </button>
          <a
            href="/dashboard"
            className="inline-block px-8 py-2 mx-auto my-2 font-extrabold text-gray-600 bg-transparent lg:mx-0 hover:underline md:my-6 lg:py-4"
          >
            View Additional Action
          </a>
        </div>

        <div className="flex items-center content-end w-full mx-auto">
          <div className="flex flex-1 w-1/2 m-6 bg-white rounded shadow-xl browser-mockup md:px-0 md:m-12"></div>
        </div>
      </div>
    </>
  )
}

export default LandingPage
