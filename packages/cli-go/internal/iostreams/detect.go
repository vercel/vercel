package iostreams

import (
	"regexp"
	"runtime"
	"slices"
	"strconv"
	"strings"
)

// Ports of chalk's detection libraries, which read raw argv.

var (
	teamCityRe  = regexp.MustCompile(`^(9\.(0*[1-9]\d*)\.|\d{2,}\.)`)
	term256Re   = regexp.MustCompile(`(?i)-256(color)?$`)
	termColorRe = regexp.MustCompile(`(?i)^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux`)
	leadingInt  = regexp.MustCompile(`^\s*[-+]?\d+`)
)

// supportsColor is supports-color 7.2.0. NO_COLOR is not consulted; only
// FORCE_COLOR and the color flags are.
func supportsColor(isTTY bool, lookup func(string) (string, bool), argv []string) bool {
	has := func(flags ...string) bool {
		return slices.ContainsFunc(flags, func(f string) bool { return slices.Contains(argv, "--"+f) })
	}
	get := func(k string) string { v, _ := lookup(k); return v }
	force := -1 // undefined
	switch {
	case has("no-color", "no-colors", "color=false", "color=never"):
		force = 0
	case has("color", "colors", "color=true", "color=always"):
		force = 1
	}
	if v, ok := lookup("FORCE_COLOR"); ok {
		switch v {
		case "true", "":
			force = 1
		case "false":
			force = 0
		default:
			force = -2 // NaN: defined, but neither 0 nor a level
			if n, err := strconv.Atoi(strings.TrimSpace(leadingInt.FindString(v))); err == nil {
				force = min(n, 3)
			}
		}
	}
	if force == 0 {
		return false
	}
	if has("color=16m", "color=full", "color=truecolor", "color=256") {
		return true
	}
	if !isTTY && force == -1 {
		return false
	}
	minimum := force > 0
	switch {
	case get("TERM") == "dumb":
		return minimum
	case runtime.GOOS == "windows":
		return true
	}
	if _, ci := lookup("CI"); ci {
		for _, k := range []string{"TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"} {
			if _, ok := lookup(k); ok {
				return true
			}
		}
		return get("CI_NAME") == "codeship" || minimum
	}
	if v, ok := lookup("TEAMCITY_VERSION"); ok {
		return teamCityRe.MatchString(v)
	}
	_, colorTerm := lookup("COLORTERM")
	switch term := get("TERM"); {
	case get("COLORTERM") == "truecolor", get("TERM_PROGRAM") == "iTerm.app", get("TERM_PROGRAM") == "Apple_Terminal",
		term256Re.MatchString(term), termColorRe.MatchString(term), colorTerm:
		return true
	}
	return minimum
}

// supportsHyperlink is supports-hyperlinks 3.0.0 for stderr.
func supportsHyperlink(stderrColor bool, getenv func(string) string, argv []string) bool {
	if v := getenv("FORCE_HYPERLINK"); v != "" {
		n, err := strconv.Atoi(v)
		return err != nil || n != 0
	}
	for _, a := range argv {
		switch a {
		case "--no-hyperlink", "--no-hyperlinks", "--hyperlink=false", "--hyperlink=never":
			return false
		case "--hyperlink=true", "--hyperlink=always":
			return true
		}
	}
	if getenv("NETLIFY") != "" {
		return true
	}
	if !stderrColor || runtime.GOOS == "windows" || getenv("CI") != "" || getenv("TEAMCITY_VERSION") != "" {
		return false
	}
	if program := getenv("TERM_PROGRAM"); program != "" {
		major, minor := version(getenv("TERM_PROGRAM_VERSION"))
		switch program {
		case "iTerm.app":
			return major > 3 || major == 3 && minor >= 1
		case "WezTerm":
			return major >= 20200620
		case "vscode":
			return major > 1 || major == 1 && minor >= 72
		}
	}
	if vte := getenv("VTE_VERSION"); vte != "" && vte != "0.50.0" {
		major, minor := version(vte)
		return major > 0 || minor >= 50
	}
	return false
}

var compactVersion = regexp.MustCompile(`^(\d{1,2})(\d{2})$`)

// version parses "major.minor[.patch]"; a compact "4601" means 0.46.1.
func version(s string) (major, minor int) {
	if m := compactVersion.FindStringSubmatch(s); m != nil {
		minor, _ = strconv.Atoi(m[1])
		return 0, minor
	}
	parts := strings.SplitN(s, ".", 3)
	major, _ = strconv.Atoi(parts[0])
	if len(parts) > 1 {
		minor, _ = strconv.Atoi(parts[1])
	}
	return major, minor
}
