class StatusController < ActionController::API
  def show
    render json: {
      message: "hello from Rails buildpacks",
      rails_env: Rails.env,
      rack_env: ENV.fetch("RACK_ENV", "missing"),
      log_to_stdout: ENV.fetch("RAILS_LOG_TO_STDOUT", "missing"),
      serve_static_files: ENV.fetch("RAILS_SERVE_STATIC_FILES", "missing"),
    }
  end
end
