module ApplicationHelper
  # The only environment variables the page may show (set by Clever Cloud).
  PLATFORM_VARS = {
    "CC_APP_NAME" => "Application", "APP_ID" => "App ID", "INSTANCE_NUMBER" => "Instance",
    "INSTANCE_TYPE" => "Instance type", "CC_PRETTY_INSTANCE_NAME" => "Instance name",
    "CC_COMMIT_ID" => "Commit", "CC_DEPLOYMENT_ID" => "Deployment"
  }.freeze

  def platform_vars
    PLATFORM_VARS.map do |name, label|
      value = ENV[name].presence
      value = value[0, 7] if value && name == "CC_COMMIT_ID"
      [ name, label, value ]
    end
  end

  # Clever Cloud injects APP_ID into every application; without it the app runs locally.
  def on_clever_cloud?
    ENV["APP_ID"].present?
  end

  # Inline an SVG from app/assets/images so it can use currentColor and CSS.
  def inline_svg(file, css_class)
    svg = Rails.root.join("app/assets/images", file).read
    svg.sub(/class="[^"]*"/, %(class="#{css_class}")).html_safe
  end
end
