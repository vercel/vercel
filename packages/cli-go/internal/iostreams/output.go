package iostreams

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Print writes to stderr, stopping the spinner first.
func (u *UI) Print(str string) {
	u.StopSpinner()
	if u.noColor {
		str = removeEmoji(str)
	}
	fmt.Fprint(u.errOut, str)
}

func (u *UI) Log(str string) { u.Print(u.ColorScheme().Gray(">") + " " + str + "\n") }

func (u *UI) Warn(str string) {
	cs := u.ColorScheme()
	u.Print(cs.Yellow(cs.Bold("WARNING! ")+str) + "\n")
}

// Error adds "<action>: <link>" when link is set.
func (u *UI) Error(str, link, action string) {
	cs := u.ColorScheme()
	u.Print(cs.Red("Error:") + " " + str + "\n")
	if link != "" {
		if action == "" {
			action = "Learn More"
		}
		u.Print(cs.Bold(action) + ": " + cs.Cyan(cs.Underline(link)) + "\n")
	}
}

func (u *UI) Fatal(str string) {
	u.Print(u.ColorScheme().Red("✗") + " " + strings.ReplaceAll(str, "\n", "\n  ") + "\n")
}

func (u *UI) Success(str string) { u.Print(u.ColorScheme().Cyan("> Success!") + " " + str + "\n") }

func (u *UI) Debug(str string) {
	if u.debug {
		cs := u.ColorScheme()
		u.Log(cs.Bold("[debug]") + " " + cs.Gray("["+time.Now().UTC().Format("2006-01-02T15:04:05.000Z")+"]") + " " + str)
	}
}

// Link is output.link: a hyperlink when supported, else fallback() or
// "text (url)".
func (u *UI) Link(text, url string, fallback func() string, color bool) string {
	cs := u.ColorScheme()
	switch {
	case !u.hyperlink && fallback != nil:
		return fallback()
	case !u.hyperlink:
		return text + " (" + cs.Cyan(cs.Underline(url)) + ")"
	case color:
		text = cs.Cyan(text)
	}
	return "\x1b]8;;" + url + "\x07" + text + "\x1b]8;;\x07"
}

// EraseLines is ansi-escapes eraseLines.
func (u *UI) EraseLines(n int) {
	if n <= 0 {
		return
	}
	u.Print(strings.Repeat("\x1b[2K\x1b[1A", n-1) + "\x1b[2K\x1b[G")
}

var Emoji = map[string]string{"notice": "📝", "tip": "💡", "warning": "❗️"}

// emojiRe: --no-color removes these labels, not all pictographs.
var emojiRe = regexp.MustCompile("📝|💡|❗️|🔗|🔍|✅|🔒|⏳")

func removeEmoji(s string) string {
	s = emojiRe.ReplaceAllString(s, "")
	if strings.HasPrefix(s, "\n") {
		return s
	}
	return strings.TrimLeft(s, " \t\n\r\v\f")
}
