const DashboardLayout = ({ children }) => {
  return (
    <div className="flex flex-no-wrap">
      {/* Sidebar starts */}
      {/* Remove class [ hidden ] and replace [ sm:flex ] with [ flex ] */}
      <div
        style={{ minHeight: 716 }}
        className="absolute flex-col justify-between hidden w-64 bg-gray-800 shadow sm:relative md:h-full sm:flex"
      >
        <div className="px-8">
          <div className="flex items-center w-full h-16">
            <img
              src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg1.svg"
              alt="Logo"
            />
          </div>
          <ul className="mt-12">
            <li className="flex items-center justify-between w-full mb-6 text-gray-300 cursor-pointer">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-grid"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <rect x={4} y={4} width={6} height={6} rx={1} />
                  <rect x={14} y={4} width={6} height={6} rx={1} />
                  <rect x={4} y={14} width={6} height={6} rx={1} />
                  <rect x={14} y={14} width={6} height={6} rx={1} />
                </svg>
                <span className="ml-2 text-sm">Dashboard</span>
              </a>
              <div className="flex items-center justify-center px-3 py-1 text-xs text-gray-300 bg-gray-600 rounded">
                5
              </div>
            </li>
            <li className="flex items-center justify-between w-full mb-6 text-gray-400 cursor-pointer hover:text-gray-300">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-puzzle"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <path d="M4 7h3a1 1 0 0 0 1 -1v-1a2 2 0 0 1 4 0v1a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 1 0 4h-1a1 1 0 0 0 -1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-1a2 2 0 0 0 -4 0v1a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h1a2 2 0 0 0 0 -4h-1a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1" />
                </svg>
                <span className="ml-2 text-sm">Products</span>
              </a>
              <div className="flex items-center justify-center px-3 py-1 text-xs text-gray-300 bg-gray-600 rounded">
                8
              </div>
            </li>
            <li className="flex items-center justify-between w-full mb-6 text-gray-400 cursor-pointer hover:text-gray-300">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-compass"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <polyline points="8 16 10 10 16 8 14 14 8 16" />
                  <circle cx={12} cy={12} r={9} />
                </svg>
                <span className="ml-2 text-sm">Performance</span>
              </a>
            </li>
            <li className="flex items-center justify-between w-full mb-6 text-gray-400 cursor-pointer hover:text-gray-300">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-code"
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <polyline points="7 8 3 12 7 16" />
                  <polyline points="17 8 21 12 17 16" />
                  <line x1={14} y1={4} x2={10} y2={20} />
                </svg>
                <span className="ml-2 text-sm">Deliverables</span>
              </a>
            </li>
            <li className="flex items-center justify-between w-full mb-6 text-gray-400 cursor-pointer hover:text-gray-300">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-puzzle"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <path d="M4 7h3a1 1 0 0 0 1 -1v-1a2 2 0 0 1 4 0v1a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 1 0 4h-1a1 1 0 0 0 -1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-1a2 2 0 0 0 -4 0v1a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h1a2 2 0 0 0 0 -4h-1a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1" />
                </svg>
                <span className="ml-2 text-sm">Invoices</span>
              </a>
              <div className="flex items-center justify-center px-3 py-1 text-xs text-gray-300 bg-gray-600 rounded">
                25
              </div>
            </li>
            <li className="flex items-center justify-between w-full mb-6 text-gray-400 cursor-pointer hover:text-gray-300">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-stack"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <polyline points="12 4 4 8 12 12 20 8 12 4" />
                  <polyline points="4 12 12 16 20 12" />
                  <polyline points="4 16 12 20 20 16" />
                </svg>
                <span className="ml-2 text-sm">Inventory</span>
              </a>
            </li>
            <li className="flex items-center justify-between w-full text-gray-400 cursor-pointer hover:text-gray-300">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-settings"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <circle cx={12} cy={12} r={3} />
                </svg>
                <span className="ml-2 text-sm">Settings</span>
              </a>
            </li>
          </ul>
          <div className="flex justify-center w-full mt-48 mb-4">
            <div className="relative">
              <div className="absolute inset-0 w-4 h-4 m-auto ml-4 text-gray-300">
                <img
                  src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg2.svg"
                  alt="Search"
                />
              </div>
              <input
                className="w-full py-2 pl-10 text-sm text-gray-300 placeholder-gray-400 bg-gray-100 bg-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-gray-100"
                type="text"
                placeholder="Search"
              />
            </div>
          </div>
        </div>
        <div className="px-8 border-t border-gray-700">
          <ul className="flex items-center justify-between w-full bg-gray-800">
            <li className="pt-5 pb-3 text-white cursor-pointer">
              <button
                aria-label="show notifications"
                className="rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <img
                  src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg3.svg"
                  alt="notifications"
                />
              </button>
            </li>
            <li className="pt-5 pb-3 text-white cursor-pointer">
              <button
                aria-label="open chats"
                className="rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <img
                  src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg4.svg"
                  alt="chat"
                />
              </button>
            </li>
            <li className="pt-5 pb-3 text-white cursor-pointer">
              <button
                aria-label="open settings"
                className="rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <img
                  src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg5.svg"
                  alt="settings"
                />
              </button>
            </li>
            <li className="pt-5 pb-3 text-white cursor-pointer">
              <button
                aria-label="open logs"
                className="rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <img
                  src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg6.svg"
                  alt="drawer"
                />
              </button>
            </li>
          </ul>
        </div>
      </div>
      <div
        className="absolute z-40 flex-col justify-between w-64 transition duration-150 ease-in-out bg-gray-800 shadow md:h-full sm:hidden"
        id="mobile-nav"
      >
        <button
          aria-label="toggle sidebar"
          id="openSideBar"
          className="absolute right-0 flex items-center justify-center w-10 h-10 mt-16 -mr-10 bg-gray-800 rounded rounded-tr rounded-br shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-800"
          onClick="sidebarHandler(true)"
        >
          <img
            src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg7.svg"
            alt="toggler"
          />
        </button>
        <button
          aria-label="Close sidebar"
          id="closeSideBar"
          className="absolute right-0 flex items-center justify-center hidden w-10 h-10 mt-16 -mr-10 text-white bg-gray-800 rounded-tr rounded-br shadow cursor-pointer"
          onClick="sidebarHandler(false)"
        >
          <img
            src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg8.svg"
            alt="cross"
          />
        </button>
        <div className="px-8">
          <div className="flex items-center w-full h-16">
            <img
              src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg1.svg"
              alt="Logo"
            />
          </div>
          <ul className="mt-12">
            <li className="flex items-center justify-between w-full mb-6 text-gray-300 cursor-pointer hover:text-gray-500">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-grid"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <rect x={4} y={4} width={6} height={6} rx={1} />
                  <rect x={14} y={4} width={6} height={6} rx={1} />
                  <rect x={4} y={14} width={6} height={6} rx={1} />
                  <rect x={14} y={14} width={6} height={6} rx={1} />
                </svg>
                <span className="ml-2 text-sm">Dashboard</span>
              </a>
              <div className="flex items-center justify-center px-3 py-1 text-xs text-gray-300 bg-gray-600 rounded">
                5
              </div>
            </li>
            <li className="flex items-center justify-between w-full mb-6 text-gray-400 cursor-pointer hover:text-gray-300">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-puzzle"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <path d="M4 7h3a1 1 0 0 0 1 -1v-1a2 2 0 0 1 4 0v1a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 1 0 4h-1a1 1 0 0 0 -1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-1a2 2 0 0 0 -4 0v1a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h1a2 2 0 0 0 0 -4h-1a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1" />
                </svg>
                <span className="ml-2 text-sm">Products</span>
              </a>
              <div className="flex items-center justify-center px-3 py-1 text-xs text-gray-300 bg-gray-600 rounded">
                8
              </div>
            </li>
            <li className="flex items-center justify-between w-full mb-6 text-gray-400 cursor-pointer hover:text-gray-300">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-compass"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <polyline points="8 16 10 10 16 8 14 14 8 16" />
                  <circle cx={12} cy={12} r={9} />
                </svg>
                <span className="ml-2 text-sm">Performance</span>
              </a>
            </li>
            <li className="flex items-center justify-between w-full mb-6 text-gray-400 cursor-pointer hover:text-gray-300">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-code"
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <polyline points="7 8 3 12 7 16" />
                  <polyline points="17 8 21 12 17 16" />
                  <line x1={14} y1={4} x2={10} y2={20} />
                </svg>
                <span className="ml-2 text-sm">Deliverables</span>
              </a>
            </li>
            <li className="flex items-center justify-between w-full mb-6 text-gray-400 cursor-pointer hover:text-gray-300">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-puzzle"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <path d="M4 7h3a1 1 0 0 0 1 -1v-1a2 2 0 0 1 4 0v1a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 1 0 4h-1a1 1 0 0 0 -1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-1a2 2 0 0 0 -4 0v1a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h1a2 2 0 0 0 0 -4h-1a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1" />
                </svg>
                <span className="ml-2 text-sm">Invoices</span>
              </a>
              <div className="flex items-center justify-center px-3 py-1 text-xs text-gray-300 bg-gray-600 rounded">
                25
              </div>
            </li>
            <li className="flex items-center justify-between w-full mb-6 text-gray-400 cursor-pointer hover:text-gray-300">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-stack"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <polyline points="12 4 4 8 12 12 20 8 12 4" />
                  <polyline points="4 12 12 16 20 12" />
                  <polyline points="4 16 12 20 20 16" />
                </svg>
                <span className="ml-2 text-sm">Inventory</span>
              </a>
            </li>
            <li className="flex items-center justify-between w-full text-gray-400 cursor-pointer hover:text-gray-300">
              <a
                href="/"
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon icon-tabler icon-tabler-settings"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path stroke="none" d="M0 0h24v24H0z" />
                  <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <circle cx={12} cy={12} r={3} />
                </svg>
                <span className="ml-2 text-sm">Settings</span>
              </a>
            </li>
          </ul>
          <div className="flex justify-center w-full mt-48 mb-4">
            <div className="relative">
              <div className="absolute inset-0 w-4 h-4 m-auto ml-4 text-gray-300">
                <img
                  src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg2.svg"
                  alt="Search"
                />
              </div>
              <input
                className="w-full py-2 pl-10 text-sm text-gray-300 placeholder-gray-400 bg-gray-100 bg-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-gray-100"
                type="text"
                placeholder="Search"
              />
            </div>
          </div>
        </div>
        <div className="px-8 border-t border-gray-700">
          <ul className="flex items-center justify-between w-full bg-gray-800">
            <li className="pt-5 pb-3 text-white cursor-pointer">
              <button
                aria-label="show notifications"
                className="rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <img
                  src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg3.svg"
                  alt="notifications"
                />
              </button>
            </li>
            <li className="pt-5 pb-3 text-white cursor-pointer">
              <button
                aria-label="open chats"
                className="rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <img
                  src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg4.svg"
                  alt="chat"
                />
              </button>
            </li>
            <li className="pt-5 pb-3 text-white cursor-pointer">
              <button
                aria-label="open settings"
                className="rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <img
                  src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg5.svg"
                  alt="settings"
                />
              </button>
            </li>
            <li className="pt-5 pb-3 text-white cursor-pointer">
              <button
                aria-label="open logs"
                className="rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <img
                  src="https://tuk-cdn.s3.amazonaws.com/can-uploader/light_with_icons_at_bottom-svg6.svg"
                  alt="drawer"
                />
              </button>
            </li>
          </ul>
        </div>
      </div>
      {/* Sidebar ends */}
      {/* Remove class [ h-64 ] when adding a card block */}
      <div className="container w-11/12 h-64 px-6 py-10 mx-auto md:w-4/5">
        {/* Remove class [ border-dashed border-2 border-gray-300 ] to remove dotted border */}
        <div className="w-full h-full border-2 border-gray-300 border-dashed rounded">
          {children}
        </div>
      </div>
    </div>
  )
}

export default DashboardLayout
