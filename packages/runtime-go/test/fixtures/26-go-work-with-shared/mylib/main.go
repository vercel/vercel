package mylib

import (
	"runtime"
)

func Say(text string) string {
	return text + ":" + runtime.Version()
}
