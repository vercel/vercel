package main

import (
	"github.com/gin-gonic/gin"
	"github.com/vercel/vercel-go"
	"net/http"
)

func main() {
	r := gin.Default()
	r.GET("/", func(c *gin.Context) {
		c.String(http.StatusOK, "Hello from Gin")
	})
	vercel.Start(r)
}
