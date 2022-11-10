User-agent: *
{{/* robotstxt.org - if ENV production variable is false robots will be disallowed. */ -}}
{{ if eq (getenv "HUGO_ENV") "production" | or (eq .Site.Params.env "production")  -}}
Allow: /
Sitemap: {{ "/sitemap.xml" | absURL }}
{{ else -}}
Disallow: /
{{ end -}}
