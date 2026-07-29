bind "tcp://0.0.0.0:#{ENV.fetch("PORT", 3000)}"
environment ENV.fetch("RAILS_ENV", "development")
