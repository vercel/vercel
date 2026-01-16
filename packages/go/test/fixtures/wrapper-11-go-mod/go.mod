module wrapper-go-mod

go 1.25.5

require (
	github.com/google/uuid v1.6.0
	github.com/vercel/vercel-go v0.0.0
)

require github.com/aws/aws-lambda-go v1.52.0 // indirect

replace github.com/vercel/vercel-go => ../../../../../go
