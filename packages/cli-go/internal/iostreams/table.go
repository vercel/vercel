package iostreams

import "strings"

// Table is util/output/table.ts: columns as wide as their widest cell plus
// hsep spaces.
func Table(rows [][]string, hsep int) string {
	var widths []int
	for _, row := range rows {
		for i, cell := range row {
			if i == len(widths) {
				widths = append(widths, 0)
			}
			widths[i] = max(widths[i], VisibleWidth(cell))
		}
	}
	lines := make([]string, len(rows))
	for r, row := range rows {
		var b strings.Builder
		for i, w := range widths {
			cell := ""
			if i < len(row) {
				cell = row[i]
			}
			b.WriteString(Pad(cell, w+hsep))
		}
		lines[r] = b.String()
	}
	return strings.Join(lines, "\n")
}

func Pad(s string, width int) string {
	if n := width - VisibleWidth(s); n > 0 {
		return s + strings.Repeat(" ", n)
	}
	return s
}

func VisibleWidth(s string) int {
	width, inEscape := 0, false
	for _, r := range s {
		switch {
		case r == '\x1b':
			inEscape = true
		case inEscape:
			inEscape = r != 'm'
		default:
			width++
		}
	}
	return width
}
