Rails.application.routes.draw do
  # Rails only adds this route itself in development; production serves the
  # same railties welcome page when the app routes to it explicitly.
  root "rails/welcome#index"
end
