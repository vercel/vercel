class StatusController < ActionController::Base
  def show
    manifest = JSON.parse(Rails.public_path.join("assets", ".manifest.json").read)
    entry = manifest.fetch("application.js")
    digested = entry.is_a?(Hash) ? entry.fetch("digested_path") : entry
    bundled = Rails.public_path.join("assets", digested).read
    raise "the esbuild bundle is missing its marker" unless bundled.include?("esbuild-bundled-asset")

    render json: {
      message: "hello from the esbuild Rails fixture",
      bundled_asset: true,
      asset_path: "/assets/#{digested}",
      rails_env: Rails.env,
      rack_env: ENV["RACK_ENV"],
      rails_serve_static_files: ENV["RAILS_SERVE_STATIC_FILES"],
      bundle_without: Bundler.settings[:without].map(&:to_s).sort,
      node_modules: Rails.root.join("node_modules").exist?,
      dummy_secret: ENV.key?("SECRET_KEY_BASE_DUMMY")
    }
  end
end
