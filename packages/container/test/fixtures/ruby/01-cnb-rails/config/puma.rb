bind "tcp://0.0.0.0:#{ENV.fetch("PORT", 3000)}"
# Puma's launcher assigns ENV["RACK_ENV"] from this directive at boot, so
# prefer the project's explicit RACK_ENV over RAILS_ENV to keep its launch
# override visible to the app.
environment ENV.fetch("RACK_ENV", ENV.fetch("RAILS_ENV", "development"))
