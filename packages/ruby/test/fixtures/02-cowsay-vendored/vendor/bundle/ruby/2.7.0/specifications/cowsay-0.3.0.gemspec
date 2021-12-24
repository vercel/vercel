# -*- encoding: utf-8 -*-
# stub: cowsay 0.3.0 ruby lib

Gem::Specification.new do |s|
  s.name = "cowsay".freeze
  s.version = "0.3.0"

  s.required_rubygems_version = Gem::Requirement.new(">= 0".freeze) if s.respond_to? :required_rubygems_version=
  s.require_paths = ["lib".freeze]
  s.authors = ["JohnnyT".freeze]
  s.date = "2016-09-29"
  s.description = "ASCII art avatars emote your messages".freeze
  s.email = ["johnnyt@moneydesktop.com".freeze]
  s.executables = ["cowsay".freeze]
  s.files = ["bin/cowsay".freeze]
  s.homepage = "https://github.com/moneydesktop/cowsay".freeze
  s.rubygems_version = "3.2.22".freeze
  s.summary = "ASCII art avatars emote your messages".freeze

  s.installed_by_version = "3.2.22" if s.respond_to? :installed_by_version

  if s.respond_to? :specification_version then
    s.specification_version = 4
  end

  if s.respond_to? :add_runtime_dependency then
    s.add_development_dependency(%q<rake>.freeze, [">= 0"])
  else
    s.add_dependency(%q<rake>.freeze, [">= 0"])
  end
end
