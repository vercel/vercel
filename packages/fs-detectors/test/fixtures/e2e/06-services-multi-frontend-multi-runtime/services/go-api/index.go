package main

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func main() {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	r.GET("/api/go", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "Hello from Gin"})
	})

	r.GET("/api/go/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "pong from Gin"})
	})

	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"detail": "404 from Gin"})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	_ = r.Run(":" + port)
}
