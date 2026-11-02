require_relative "boot"

require "rails"
# Only the frameworks the arcade needs: no database other than Redis.
require "active_model/railtie"
require "action_controller/railtie"
require "action_view/railtie"
require "action_cable/engine" # live board: Action Cable rides on Redis pub/sub
require "rails/test_unit/railtie"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module DemoRubyRedis
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    config.autoload_lib(ignore: %w[assets tasks])

    # Don't generate system test files.
    config.generators.system_tests = nil
  end
end
