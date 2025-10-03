package handler

import (
	"github.com/gin-gonic/gin"
)

var Router = func() *gin.Engine {
	r := gin.Default()
	r.GET("/", func(c *gin.Context) {
		c.String(200, "hello from gin:RANDOMNESS_PLACEHOLDER")
	})
	r.GET("/hello/:name", func(c *gin.Context) {
		name := c.Param("name")
		c.String(200, "hello %s", name)
	})
	return r
}()
