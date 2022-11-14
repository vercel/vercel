const LandingLayout = ({ children }) => {
  return (
    <div className="flex flex-col leading-relaxed tracking-wide gradient">
      <nav id="header" className="top-0 z-30 w-full py-1 text-white lg:py-6">
        <div className="container flex flex-wrap items-center justify-between w-full px-2 py-2 mx-auto mt-0 lg:py-6">
          <div className="flex items-center pl-4">
            <a
              className="text-2xl font-bold text-white no-underline hover:no-underline lg:text-4xl"
              href="#"
            >
              <svg
                className="inline-block w-6 h-6 text-yellow-700 fill-current"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
              >
                <path d="M13 8V0L8.11 5.87 3 12h4v8L17 8h-4z" />
              </svg>
              Bolt App
            </a>
          </div>

          <div className="block pr-4 lg:hidden">
            <button
              id="nav-toggle"
              className="flex items-center px-3 py-2 text-gray-500 border border-gray-600 rounded appearance-none hover:text-gray-800 hover:border-green-500 focus:outline-none"
            >
              <svg
                className="w-3 h-3 fill-current"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <title>Menu</title>
                <path d="M0 3h20v2H0V3zm0 6h20v2H0V9zm0 6h20v2H0v-2z" />
              </svg>
            </button>
          </div>

          <div
            className="z-20 flex-grow hidden w-full p-4 mt-2 text-black lg:flex lg:items-center lg:w-auto lg:block lg:mt-0 lg:p-0"
            id="nav-content"
          >
            <ul className="items-center justify-end flex-1 list-reset lg:flex">
              <li className="mr-3">
                <a
                  className="inline-block px-4 py-2 font-bold text-black no-underline"
                  href="#"
                >
                  Active
                </a>
              </li>
              <li className="mr-3">
                <a
                  className="inline-block px-4 py-2 text-black no-underline hover:text-gray-800 hover:text-underline"
                  href="#"
                >
                  link
                </a>
              </li>
              <li className="mr-3">
                <a
                  className="inline-block px-4 py-2 text-black no-underline hover:text-gray-800 hover:text-underline"
                  href="#"
                >
                  link
                </a>
              </li>
            </ul>
            <button
              id="navAction"
              className="px-8 py-4 mx-auto mt-4 font-extrabold text-gray-800 rounded shadow opacity-75 lg:mx-0 hover:underline lg:mt-0"
            >
              Action
            </button>
          </div>
        </div>
      </nav>
      {children}
    </div>
  )
}

export default LandingLayout
