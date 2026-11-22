package cli

import (
	"io"

	"github.com/vercel/vercel/packages/cli-go/internal/config"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

// Result is what a command returns. Render is the only place a command
// writes stdout.
type Result interface {
	Render(stdout io.Writer, ui *iostreams.UI)
}

// JSONResult is what RunJSON returns: JSON() is written instead of Render
// for --json and --format json.
type JSONResult interface {
	Result
	JSON() any
}

// Exiter is rendered, then exits non-zero (whoami when logged out).
type Exiter interface{ ExitCode() int }

// WriteJSON is JSON.stringify(v, null, 2) plus a newline.
func WriteJSON(w io.Writer, v any) { _, _ = w.Write(append(config.Stringify(v, "  "), '\n')) }
