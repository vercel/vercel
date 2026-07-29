require_relative "boot"
require "rails"
require "action_controller/railtie"

Bundler.require(*Rails.groups)

module BuildpackRails
  class Application < Rails::Application
    config.load_defaults 7.2
    config.api_only = true
  end
end
