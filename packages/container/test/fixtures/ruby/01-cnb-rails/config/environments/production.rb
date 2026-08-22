Rails.application.configure do
  config.consider_all_requests_local = false
  config.eager_load = true
  config.public_file_server.enabled =
    ENV["RAILS_SERVE_STATIC_FILES"].present?

  if ENV["RAILS_LOG_TO_STDOUT"].present?
    config.logger = ActiveSupport::TaggedLogging.new(
      ActiveSupport::Logger.new($stdout)
    )
  end
end
