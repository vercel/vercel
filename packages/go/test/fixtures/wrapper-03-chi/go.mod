module wrapper-03-chi

go 1.25.5

require (
	github.com/go-chi/chi/v5 v5.0.10
	github.com/vercel/vercel-go v0.0.0
)

require github.com/aws/aws-lambda-go v1.52.0 // indirect

replace github.com/vercel/vercel-go => ../../../../../go
