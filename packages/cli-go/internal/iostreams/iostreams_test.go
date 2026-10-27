package iostreams

import "testing"

func TestColorOnlyWhenEnabled(t *testing.T) {
	ios, _, stderr := Test()
	ios.SetColorEnabled(true)
	ios.Error("x", "", "")
	if stderr.String() != "\x1b[31mError:\x1b[39m x\n" {
		t.Errorf("colored error %q", stderr.String())
	}
}

func TestDisableColorRemovesEmoji(t *testing.T) {
	ios, _, stderr := Test()
	ios.SetColorEnabled(true)
	ios.DisableColor()
	ios.Print(Emoji["tip"] + " text\n")
	ios.Print("\n  " + Emoji["tip"] + " kept indent\n")
	if stderr.String() != "text\n\n   kept indent\n" {
		t.Errorf("stderr %q", stderr.String())
	}
}

func TestLinkFallsBackWithoutHyperlinks(t *testing.T) {
	ios, _, _ := Test()
	if got := ios.Link("docs", "https://vercel.com", nil, false); got != "docs (https://vercel.com)" {
		t.Errorf("fallback %q", got)
	}
	if got := ios.Link("docs", "https://vercel.com", func() string { return "custom" }, false); got != "custom" {
		t.Errorf("custom fallback %q", got)
	}
	ios.hyperlink = true
	if got := ios.Link("docs", "https://vercel.com", nil, false); got != "\x1b]8;;https://vercel.com\x07docs\x1b]8;;\x07" {
		t.Errorf("hyperlink %q", got)
	}
}

func TestEraseLines(t *testing.T) {
	ios, _, stderr := Test()
	ios.EraseLines(0)
	ios.EraseLines(2)
	if stderr.String() != "\x1b[2K\x1b[1A\x1b[2K\x1b[G" {
		t.Errorf("EraseLines(2) = %q", stderr.String())
	}
}

func TestSpinnerOffTerminalPrintsOnce(t *testing.T) {
	ios, _, stderr := Test()
	ios.StartSpinner("Waiting...")
	ios.StopSpinner()
	if stderr.String() != "Waiting...\n" {
		t.Errorf("stderr %q", stderr.String())
	}
}

func TestSupportsColor(t *testing.T) {
	env := func(vars map[string]string) func(string) (string, bool) {
		return func(k string) (string, bool) { v, ok := vars[k]; return v, ok }
	}
	cases := []struct {
		name string
		tty  bool
		vars map[string]string
		argv []string
		want bool
	}{
		{"pipe", false, map[string]string{"TERM": "xterm"}, nil, false},
		{"terminal", true, map[string]string{"TERM": "xterm-256color"}, nil, true},
		{"dumb terminal", true, map[string]string{"TERM": "dumb"}, nil, false},
		{"FORCE_COLOR=0", true, map[string]string{"TERM": "xterm", "FORCE_COLOR": "0"}, nil, false},
		{"FORCE_COLOR on a pipe", false, map[string]string{"FORCE_COLOR": "1"}, nil, true},
		{"--no-color", true, map[string]string{"TERM": "xterm"}, []string{"--no-color"}, false},
		// supports-color 7 does not read NO_COLOR, so neither does chalk.
		{"NO_COLOR is ignored", true, map[string]string{"TERM": "xterm", "NO_COLOR": "1"}, nil, true},
	}
	for _, c := range cases {
		if got := supportsColor(c.tty, env(c.vars), c.argv); got != c.want {
			t.Errorf("%s: supportsColor = %v, want %v", c.name, got, c.want)
		}
	}
}
