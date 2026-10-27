package config

import (
	"os"
	"path/filepath"
	"runtime"
)

// GlobalDir is cli-config getGlobalPathConfig.
func GlobalDir() string {
	home, _ := os.UserHomeDir()
	vercel := dataDirs("com.vercel.cli")
	candidates := append(append(append([]string{}, vercel...), filepath.Join(home, ".now")), dataDirs("now")...)
	for _, p := range candidates {
		if info, err := os.Lstat(p); err == nil && info.IsDir() {
			return p
		}
	}
	return vercel[0]
}

// dataDirs follows xdg-app-paths.
func dataDirs(name string) []string {
	dirs := []string{filepath.Join(dataHome(), name)}
	for _, d := range filepath.SplitList(os.Getenv("XDG_DATA_DIRS")) {
		if d != "" {
			dirs = append(dirs, filepath.Join(d, name))
		}
	}
	return dirs
}

func dataHome() string {
	if v := os.Getenv("XDG_DATA_HOME"); v != "" {
		return v
	}
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support")
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			appData = filepath.Join(home, "AppData", "Roaming")
		}
		return filepath.Join(appData, "xdg.data")
	}
	return filepath.Join(home, ".local", "share")
}
