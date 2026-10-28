// Package iostreams is the terminal. Commands get a *UI, which cannot
// write stdout; the framework holds the *IOStreams around it.
package iostreams

import (
	"bytes"
	"io"
	"os"

	"golang.org/x/term"
)

type IOStreams struct {
	*UI
	Out io.Writer
}

type UI struct {
	errOut    io.Writer
	stdoutTTY bool
	stderrTTY bool
	color     bool
	noColor   bool // --no-color, which also strips emoji
	hyperlink bool
	debug     bool
	width     int
	spinner   *spinner
}

func System() *IOStreams {
	ui := &UI{errOut: os.Stderr, stdoutTTY: isTerminal(os.Stdout), stderrTTY: isTerminal(os.Stderr), width: 80}
	if os.Getenv("FORCE_TTY") == "1" {
		ui.stdoutTTY = true
	}
	if w, _, err := term.GetSize(int(os.Stderr.Fd())); err == nil && w > 0 {
		ui.width = w
	}
	// Chalk colors every stream by stdout's support.
	ui.color = supportsColor(ui.stdoutTTY, os.LookupEnv, os.Args[1:])
	ui.hyperlink = supportsHyperlink(supportsColor(ui.stderrTTY, os.LookupEnv, os.Args[1:]), os.Getenv, os.Args[1:])
	return &IOStreams{UI: ui, Out: os.Stdout}
}

// Test returns buffer-backed streams that are not terminals.
func Test() (ios *IOStreams, stdout, stderr *bytes.Buffer) {
	stdout, stderr = &bytes.Buffer{}, &bytes.Buffer{}
	return &IOStreams{UI: &UI{errOut: stderr, width: 80}, Out: stdout}, stdout, stderr
}

func (u *UI) IsStdoutTTY() bool         { return u.stdoutTTY }
func (u *UI) SetStdoutTTY(v bool)       { u.stdoutTTY = v }
func (u *UI) SetColorEnabled(v bool)    { u.color = v }
func (u *UI) SetDebug(v bool)           { u.debug = v }
func (u *UI) SupportsHyperlink() bool   { return u.hyperlink }
func (u *UI) ColorScheme() *ColorScheme { return &ColorScheme{enabled: u.color} }

// TerminalWidth is stderr's width, 80 when unknown.
func (u *UI) TerminalWidth() int { return u.width }

// DisableColor is --no-color, which also removes emoji.
func (u *UI) DisableColor() { u.color, u.noColor = false, true }

func isTerminal(f *os.File) bool { return term.IsTerminal(int(f.Fd())) }
