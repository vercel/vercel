// In this file, all Page components from 'src/pages` are auto-imported. Nested
// directories are supported, and should be uppercase. Each subdirectory will be
// prepended onto the component name.
//
// Examples:
//
// 'src/pages/HomePage/HomePage.js'         -> HomePage
// 'src/pages/Admin/BooksPage/BooksPage.js' -> AdminBooksPage

import { Router, Route, Set } from '@redwoodjs/router'

import LandingLayout from 'src/layouts/LandingLayout'
import DashboardLayout from 'src/layouts/DashboardLayout'

const Routes = () => {
  return (
    <Router>
      <Route path="/nested/hello" page={NestedPage} name="nested" prerender />
      <Route path="/login" page={LoginPage} name="login" />
      <Set wrap={[DashboardLayout]}>
        <Route path="/dashboard" page={DashboardPage} name="dashboard" prerender />
      </Set>
      <Set wrap={[LandingLayout]}>
        <Route path="/" page={LandingPage} name="landing" prerender />
      </Set>
      <Route notfound page={NotFoundPage} prerender />
    </Router>
  )
}

export default Routes
