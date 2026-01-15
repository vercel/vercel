# Vercel Go Runtime

This package (`github.com/vercel/vercel-go`) provides the Go runtime for Vercel Serverless Functions.

It supports "Wrapper Mode", which allows you to write standard Go HTTP servers using `net/http` and deploy them to Vercel with zero configuration.

## Features

- **Standard HTTP API**: Use `http.Handler`, `http.HandleFunc`, or any Go web framework compatible with the standard library.
- **Zero Config**: No need to rewrite your code for Lambda or serverless specific APIs.
- **Framework Support**: Works with Gin, Chi, Echo, Gorilla Mux, and more.
- **Local Development**: Run `go run main.go` to start a local server that mimics the production environment.

## Installation

```bash
go get github.com/vercel/vercel-go
```

## Usage

Create a `main.go` file in your project root or `api/` directory:

```go
package main

import (
	"fmt"
	"net/http"

	"github.com/vercel/vercel-go"
)

func main() {
	// Use standard http.HandleFunc
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello, World!")
	})

	// Use vercel.Start to listen and serve
	// This automatically handles Lambda events in production
	// and starts a local HTTP server in development.
	vercel.Start(http.DefaultServeMux)
}
```

### Configuration

Ensure your `vercel.json` is configured to use the Go builder (optional if zero-config is fully supported in the future, but recommended for now):

```json
{
  "builds": [
    {
      "src": "main.go",
      "use": "@vercel/go",
      "config": { "wrapper": true }
    }
  ]
}
```

## Framework Examples

### Gin

```go
package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/vercel/vercel-go"
)

func main() {
	r := gin.Default()
	r.GET("/", func(c *gin.Context) {
		c.String(http.StatusOK, "Hello from Gin")
	})

	vercel.Start(r)
}
```

### Chi

```go
package main

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/vercel/vercel-go"
)

func main() {
	r := chi.NewRouter()
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Hello from Chi"))
	})

	vercel.Start(r)
}
```
