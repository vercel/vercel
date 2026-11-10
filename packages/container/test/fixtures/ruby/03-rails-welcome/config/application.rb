require "bundler/setup"
require "rails"
require "action_controller/railtie"

Bundler.require(*Rails.groups)

module App
  class Application < Rails::Application
    config.root = File.expand_path("..", __dir__)
    config.load_defaults 8.1
    config.enable_reloading = false
    config.eager_load = true
    config.cache_store = :memory_store
    config.logger = ActiveSupport::Logger.new($stdout)
  end
end
