# -*- encoding: utf-8 -*-
lib = File.expand_path('../lib', __FILE__)
$LOAD_PATH.unshift(lib) unless $LOAD_PATH.include?(lib)
require 'cowsay/version'

Gem::Specification.new do |gem|
  gem.name          = 'cowsay'
  gem.version       = Cowsay::VERSION
  gem.authors       = ['JohnnyT']
  gem.email         = ['johnnyt@moneydesktop.com']
  gem.description   = %q{ASCII art avatars emote your messages}
  gem.summary       = gem.description
  gem.homepage      = 'https://github.com/moneydesktop/cowsay'

  gem.files         = `git ls-files`.split($/)
  gem.executables   = gem.files.grep(%r{^bin/}).map{ |f| File.basename(f) }
  gem.test_files    = gem.files.grep(%r{^(test|spec|features)/})
  gem.require_paths = ['lib']

  gem.add_development_dependency 'rake'
  # gem.add_development_dependency 'rspec-pride'
end
