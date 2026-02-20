package main

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

// Embed static files at compile time
//
//go:embed public/*
var staticFiles embed.FS

type DataItem struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Value int    `json:"value"`
}

type DataResponse struct {
	Data      []DataItem `json:"data"`
	Total     int        `json:"total"`
	Timestamp string     `json:"timestamp"`
}

type ItemResponse struct {
	Item      DataItem `json:"item"`
	Timestamp string   `json:"timestamp"`
}

func main() {
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// Serve embedded static files
	// Strip "public" prefix so files are served at root (e.g., /index.html, /favicon.ico)
	publicFS, _ := fs.Sub(staticFiles, "public")
	r.StaticFS("/static", http.FS(publicFS))

	// Serve index.html at root
	r.GET("/", func(c *gin.Context) {
		data, err := staticFiles.ReadFile("public/index.html")
		if err != nil {
			c.String(http.StatusNotFound, "Not found")
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", data)
	})

	// Serve favicon at root
	r.GET("/favicon.ico", func(c *gin.Context) {
		data, err := staticFiles.ReadFile("public/favicon.ico")
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		c.Data(http.StatusOK, "image/x-icon", data)
	})

	// API routes
	r.GET("/api/data", getData)
	r.GET("/api/items/:id", getItem)

	// Get port from environment variable (Vercel sets this)
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	r.Run(":" + port)
}

func getData(c *gin.Context) {
	items := []DataItem{
		{ID: 1, Name: "Sample Item 1", Value: 100},
		{ID: 2, Name: "Sample Item 2", Value: 200},
		{ID: 3, Name: "Sample Item 3", Value: 300},
	}

	c.JSON(http.StatusOK, DataResponse{
		Data:      items,
		Total:     len(items),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

func getItem(c *gin.Context) {
	id := c.Param("id")

	c.JSON(http.StatusOK, ItemResponse{
		Item: DataItem{
			ID:    1,
			Name:  "Sample Item " + id,
			Value: 100,
		},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}
