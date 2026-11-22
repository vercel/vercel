package iostreams

type ColorScheme struct{ enabled bool }

func (c *ColorScheme) wrap(open, close, s string) string {
	if !c.enabled {
		return s
	}
	return open + s + close
}

func (c *ColorScheme) Bold(s string) string      { return c.wrap("\x1b[1m", "\x1b[22m", s) }
func (c *ColorScheme) Dim(s string) string       { return c.wrap("\x1b[2m", "\x1b[22m", s) }
func (c *ColorScheme) Underline(s string) string { return c.wrap("\x1b[4m", "\x1b[24m", s) }
func (c *ColorScheme) Red(s string) string       { return c.wrap("\x1b[31m", "\x1b[39m", s) }
func (c *ColorScheme) Yellow(s string) string    { return c.wrap("\x1b[33m", "\x1b[39m", s) }
func (c *ColorScheme) Cyan(s string) string      { return c.wrap("\x1b[36m", "\x1b[39m", s) }
func (c *ColorScheme) Gray(s string) string      { return c.wrap("\x1b[90m", "\x1b[39m", s) }

// Cmd is upstream's cmd(): `vercel login`.
func (c *ColorScheme) Cmd(text string) string { return c.Gray("`") + c.Cyan(text) + c.Gray("`") }

// Param is upstream's param(): "--token".
func (c *ColorScheme) Param(text string) string { return c.Gray(`"`) + c.Bold(text) + c.Gray(`"`) }
