package server

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
)

//go:embed assets/*
var assets embed.FS

type DataItem struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Value int    `json:"value"`
}

type DataResponse struct {
	Data      []DataItem `json:"data"`
	Total     int        `json:"total"`
	Framework string     `json:"framework"`
	Version   string     `json:"version"`
	Timestamp string     `json:"timestamp"`
}

type ItemResponse struct {
	Item      DataItem `json:"item"`
	Framework string   `json:"framework"`
	Version   string   `json:"version"`
	Timestamp string   `json:"timestamp"`
}

func Run() error {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	assetFS, err := fs.Sub(assets, "assets")
	if err != nil {
		return err
	}

	r.StaticFS("/static", http.FS(assetFS))

	r.GET("/", func(c *gin.Context) {
		c.Data(
			http.StatusOK,
			"text/html; charset=utf-8",
			[]byte("<html><body>framework:gin version:"+runtime.Version()+" randomness:RANDOMNESS_PLACEHOLDER</body></html>"),
		)
	})

	r.GET("/api/data", func(c *gin.Context) {
		items := []DataItem{
			{ID: 1, Name: "Sample Item 1", Value: 100},
			{ID: 2, Name: "Sample Item 2", Value: 200},
			{ID: 3, Name: "Sample Item 3", Value: 300},
		}

		c.JSON(http.StatusOK, DataResponse{
			Data:      items,
			Total:     len(items),
			Framework: "gin",
			Version:   runtime.Version(),
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	})

	r.GET("/api/items/:id", func(c *gin.Context) {
		c.JSON(http.StatusOK, ItemResponse{
			Item: DataItem{
				ID:    1,
				Name:  "Sample Item " + c.Param("id"),
				Value: 100,
			},
			Framework: "gin",
			Version:   runtime.Version(),
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	})

	r.NoRoute(func(c *gin.Context) {
		c.String(http.StatusNotFound, "not found:gin")
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	return r.Run(":" + port)
}
