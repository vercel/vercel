export default () => (
  <main>
    <section>
      <div className="bg-gradient-to-r from-purple-300 to-blue-200">
        <div className="flex items-center justify-center w-9/12 min-h-screen py-16 m-auto">
          <div className="pb-8 overflow-hidden bg-white shadow sm:rounded-lg">
            <div className="pt-8 text-center border-t border-gray-200">
              <h1 className="font-bold text-purple-400 text-9xl">404</h1>
              <h1 className="py-8 text-6xl font-medium">
                oops! Page not found
              </h1>
              <p className="px-12 pb-8 text-2xl font-medium">
                Oops! The page you are looking for does not exist. It might have
                been moved or deleted.
              </p>
              <button className="px-6 py-3 mr-6 font-semibold text-white rounded-md bg-gradient-to-r from-purple-400 to-blue-500 hover:from-pink-500 hover:to-orange-500">
                HOME
              </button>
              <button className="px-6 py-3 font-semibold text-white rounded-md bg-gradient-to-r from-red-400 to-red-500 hover:from-red-500 hover:to-red-500">
                Contact Us
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
)
