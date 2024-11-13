package handler

import (
	"fmt"
	"net/http"

	"github.com/gofiber/fiber/v3"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	app := fiber.New()
	version := app.Config().Version
	fmt.Fprintf(w, "Using Fiber version: %s", version)
}
