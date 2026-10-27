package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"strings"
	"time"
)

func main() {
	switch append(os.Args, "")[1] {
	case "child":
		time.Sleep(time.Hour)
	case "zombies":
		zombies := 0
		entries, _ := os.ReadDir("/proc")
		for _, entry := range entries {
			stat, _ := os.ReadFile("/proc/" + entry.Name() + "/stat")
			if strings.Contains(string(stat), ") Z ") {
				zombies++
			}
		}
		json.NewEncoder(os.Stdout).Encode(zombies)
	default:
		// A descendant holding the output pipes must not outlive its invocation.
		child := exec.Command("/job", "child")
		child.Stdout = os.Stdout
		child.Start()
		dir, _ := os.Getwd()
		json.NewEncoder(os.Stdout).Encode(map[string]interface{}{
			"args": os.Args[1:], "cwd": dir, "env": os.Getenv("IMAGE_ENV"), "uid": os.Getuid(),
			"schedule": os.Getenv("VERCEL_SCHEDULE_NAME"),
		})
	}
}
