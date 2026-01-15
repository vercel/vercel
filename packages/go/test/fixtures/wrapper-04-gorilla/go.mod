module wrapper-04-gorilla

go 1.25.5

require (
	github.com/gorilla/mux v1.8.0
	github.com/vercel/vercel-go v0.0.0
)

require github.com/aws/aws-lambda-go v1.52.0 // indirect

replace github.com/vercel/vercel-go => ../../../../../go
