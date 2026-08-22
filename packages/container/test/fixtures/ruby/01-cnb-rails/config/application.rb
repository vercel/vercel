require_relative "boot"
require "rails"
require "action_controller/railtie"

Bundler.require(*Rails.groups)

module BuildpackRails
  class Application < Rails::Application
    config.load_defaults 7.2
    config.api_only = true
    # Test fixture only: hardcode a throwaway secret so no SECRET_KEY_BASE
    # env var is needed at build time (assets:precompile) or run time.
    config.secret_key_base =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  end
end
