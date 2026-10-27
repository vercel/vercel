package cli

import (
	"regexp"
	"slices"
	"sort"
	"strings"

	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

// CommandHelp is help.ts buildHelpOutput, plus Related. parent is nil for
// a top-level command.
func CommandHelp(root, cmd, parent *Command, columns int, cs *iostreams.ColorScheme) string {
	sections := []string{
		"",
		synopsis(cmd, parent, cs),
		wordWrap(cmd.Description, columns) + "\n",
	}
	for _, s := range []string{
		subcommandSection(cmd, columns, cs),
		optionSection(cmd, cmd.AllFlags(), columns, "Options", cs),
		optionSection(nil, globalFlags(cmd), columns, "Global Options", cs),
		exampleSection(cmd, cs),
		helpSections(cmd, columns, cs),
		relatedSection(root, cmd, columns, cs),
	} {
		if s != "" {
			sections = append(sections, s)
		}
	}
	return strings.Join(append(sections, ""), "\n")
}

const indent = "  "

// synopsis is buildCommandSynopsisLine. A group takes an implicit
// "command" argument, optional when a child is Default.
func synopsis(cmd, parent *Command, cs *iostreams.ColorScheme) string {
	line := []string{indent, "▲", cs.Bold("vercel")}
	if parent != nil {
		line = append(line, cs.Bold(parent.Name))
	}
	line = append(line, cs.Bold(cmd.Name))
	args := cmd.Args
	if len(args) == 0 && cmd.IsGroup() {
		args = []Arg{{Name: "command", Required: cmd.DefaultChild() == nil}}
	}
	for _, a := range args {
		line = append(line, argUsage(a))
	}
	if len(cmd.AllFlags()) > 0 {
		line = append(line, "[options]")
	}
	return lineToString(append(line, "\n"))
}

func argUsage(a Arg) string {
	name := a.Name
	if a.Multiple {
		name += " ..."
	}
	if a.Required {
		return name
	}
	return "[" + name + "]"
}

func lineToString(parts []string) string {
	var b strings.Builder
	for i, p := range parts {
		b.WriteString(p)
		if i < len(parts)-1 && strings.TrimSpace(p) != "" && strings.TrimSpace(parts[i+1]) != "" {
			b.WriteString(" ")
		}
	}
	return b.String()
}

func globalFlags(cmd *Command) []*Flag {
	var flags []*Flag
	for _, f := range GlobalFlags {
		if slices.Contains(cmd.HiddenGlobalFlags, f) {
			continue
		}
		flags = append(flags, f)
	}
	return flags
}

// subcommandSection is buildSubcommandLines.
func subcommandSection(cmd *Command, columns int, cs *iostreams.ColorScheme) string {
	var rows [][]string
	unwrapped := 0
	for _, child := range cmd.Children {
		if child.Hidden {
			continue
		}
		args := make([]string, len(child.Args))
		for i, a := range child.Args {
			args[i] = argUsage(Arg{Name: a.Name, Required: a.Required}) // no "..." here, as upstream
		}
		name, argCell := indent+child.Name, indent+strings.Join(args, " ")+indent
		unwrapped = max(unwrapped, len(name)+len(argCell))
		desc := child.Description
		if child.Default {
			desc += " " + cs.Bold("(default)")
		}
		rows = append(rows, []string{name, argCell, desc})
	}
	if len(rows) == 0 {
		return ""
	}
	const rightMargin = len(indent) * 4
	return section(cs, "Commands", table(rows, columns-unwrapped-rightMargin))
}

// optionSection: cmd is nil for global flags; otherwise it describes
// --limit.
func optionSection(cmd *Command, flags []*Flag, columns int, title string, cs *iostreams.ColorScheme) string {
	var visible []*Flag
	for _, f := range flags {
		if f.documented() {
			visible = append(visible, f)
		}
	}
	if len(visible) == 0 {
		return ""
	}
	sort.SliceStable(visible, func(i, j int) bool { return visible[i].Name < visible[j].Name })
	rows := make([][]string, len(visible))
	unwrapped := 0
	for i, f := range visible {
		short := ""
		if f.Short != "" {
			short = indent + "-" + f.Short + ","
		}
		long := indent + "--" + f.Name
		if f.Argument != "" {
			long += " <" + f.Argument + ">"
		}
		long += indent
		unwrapped = max(unwrapped, len(short)+len(long))
		desc := f.Description
		if f == FlagLimit && cmd != nil && cmd.Pagination != nil {
			desc = cmd.Pagination.limitDescription()
		}
		rows[i] = []string{short, long, desc}
	}
	return section(cs, title, table(rows, columns-unwrapped))
}

// exampleSection is buildCommandExampleLines.
func exampleSection(cmd *Command, cs *iostreams.ColorScheme) string {
	if len(cmd.Examples) == 0 {
		return ""
	}
	out := []string{indent + cs.Dim("Examples:"), ""}
	for _, e := range cmd.Examples {
		out = append(out, lineToString([]string{indent, cs.Gray("-"), e.Name}), "")
		for _, v := range e.Value {
			out = append(out, lineToString([]string{indent, indent, cs.Cyan("$ " + v)}))
		}
		out = append(out, "")
	}
	return strings.Join(out, "\n")
}

func helpSections(cmd *Command, columns int, cs *iostreams.ColorScheme) string {
	var out []string
	for _, s := range cmd.HelpSections {
		out = append(out, indent+cs.Dim(s.Title+":"), "")
		for _, line := range s.Body {
			if line != "" {
				line = wordWrap(line, columns)
			}
			out = append(out, line)
		}
		out = append(out, "", "")
	}
	return strings.TrimSuffix(strings.Join(out, "\n"), "\n")
}

func relatedSection(root, cmd *Command, columns int, cs *iostreams.ColorScheme) string {
	var rows [][]string
	unwrapped := 0
	for _, path := range cmd.Related {
		names := strings.Fields(path)
		found := Find(root, names)
		if len(found) != len(names) {
			panic("cli: " + cmd.Name + " is related to unknown command " + path)
		}
		name := indent + "vercel " + path + indent
		unwrapped = max(unwrapped, len(name))
		rows = append(rows, []string{name, found[len(found)-1].Description})
	}
	if len(rows) == 0 {
		return ""
	}
	return section(cs, "Related", table(rows, columns-unwrapped-len(indent)))
}

func section(cs *iostreams.ColorScheme, title, body string) string {
	return indent + cs.Dim(title) + ":\n\n" + body + "\n\n"
}

// table is cli-table3 without borders or padding, the last column
// word-wrapped to lastWidth.
func table(rows [][]string, lastWidth int) string {
	n := len(rows[0])
	widths := make([]int, n)
	for _, r := range rows {
		for i := 0; i < n-1; i++ {
			widths[i] = max(widths[i], iostreams.VisibleWidth(r[i]), 1)
		}
	}
	var lines []string
	for _, r := range rows {
		for li, text := range wrap(r[n-1], lastWidth) {
			var b strings.Builder
			for i := 0; i < n-1; i++ {
				cell := ""
				if li == 0 {
					cell = r[i]
				}
				b.WriteString(iostreams.Pad(cell, widths[i]))
			}
			b.WriteString(iostreams.Pad(text, lastWidth))
			lines = append(lines, b.String())
		}
	}
	return strings.Join(lines, "\n")
}

// wordWrap is help.ts wordWrap: one cli-table3 cell, left padding 2.
func wordWrap(text string, width int) string {
	lines := wrap(text, width-len(indent))
	for i, l := range lines {
		lines[i] = iostreams.Pad(indent+l, width)
	}
	return strings.Join(lines, "\n")
}

func wrap(text string, width int) []string {
	words := strings.Fields(text)
	if len(words) == 0 {
		return []string{""}
	}
	var lines []string
	current := words[0]
	for _, w := range words[1:] {
		if iostreams.VisibleWidth(current)+1+iostreams.VisibleWidth(w) <= width {
			current += " " + w
		} else {
			lines = append(lines, current)
			current = w
		}
	}
	return append(lines, current)
}

func RootHelp(root *Command, columns int, cs *iostreams.ColorScheme) string {
	rows := rootRows(root)
	var basic, advanced []helpRow
	for _, r := range rows {
		if r.basic {
			basic = append(basic, r)
		} else {
			advanced = append(advanced, r)
		}
	}
	u := func(s string) string { return cs.Bold(cs.Underline(s)) }
	example := func(title, command string) string {
		return "  " + cs.Gray("–") + " " + title + "\n\n    " + cs.Cyan("$ "+command) + "\n\n"
	}
	var b strings.Builder
	b.WriteString("\n  " + cs.Bold("▲ vercel") + " [options] <command | path>\n\n")
	b.WriteString("  " + cs.Dim("For deploy command help, run `vercel deploy --help`") + "\n\n")
	b.WriteString("  " + cs.Dim("Commands:") + "\n\n")
	b.WriteString("    " + cs.Dim("Basic") + "\n\n" + commandRows(basic, rows, columns) + "\n\n")
	b.WriteString("    " + cs.Dim("Advanced") + "\n\n" + commandRows(advanced, rows, columns) + "\n\n")
	b.WriteString("  " + cs.Dim("Global Options:") + "\n\n")
	b.WriteString("    -h, --help                     Output usage information\n")
	b.WriteString("    -v, --version                  Output the version number\n")
	b.WriteString("    --changelog                    Show the 5 latest Vercel product updates\n")
	b.WriteString("    --cwd                          Current working directory\n")
	b.WriteString("    -A " + u("FILE") + ", --local-config=" + u("FILE") + "   Path to the local `vercel.json` file\n")
	b.WriteString("    -Q " + u("DIR") + ", --global-config=" + u("DIR") + "    Path to the global `.vercel` directory\n")
	b.WriteString("    -d, --debug                    Debug mode [off]\n")
	b.WriteString("    --no-color                     No color mode [off]\n")
	b.WriteString("    --non-interactive              Run without interactive prompts (default when agent detected)\n")
	b.WriteString("    -S, --scope                    Set a custom scope\n")
	b.WriteString("    -t " + cs.Underline("TOKEN") + ", --token=" + cs.Underline("TOKEN") + "        Login token\n\n")
	b.WriteString("  " + cs.Dim("Examples:") + "\n\n")
	b.WriteString(example("Deploy the current directory", "vercel"))
	b.WriteString(example("Deploy a custom path", "vercel /usr/src/project"))
	b.WriteString(example("Deploy with Environment Variables", "vercel -e NODE_ENV=production"))
	b.WriteString(example("Show the usage information for the sub command "+cs.Dim("`list`"), "vercel help list"))
	b.WriteString(example("Show the 5 latest Vercel product updates", "vercel --changelog"))
	b.WriteString("  " + cs.Gray("–") + " Search Vercel product updates\n\n    " + cs.Cyan(`$ vercel changelog search "AI SDK"`) + "\n")
	return b.String()
}

type helpRow struct {
	names       []string
	description string
	basic       bool
}

// rootRows is getRootHelpCommands: commands with their aliases of up to 3
// characters, sorted by name.
func rootRows(root *Command) []helpRow {
	rows := []helpRow{{names: []string{"help"}, description: "Show help for a command", basic: true}}
	for _, c := range root.Children {
		if c.Hidden {
			continue
		}
		var names []string
		for _, a := range c.Aliases {
			if len(a) <= 3 {
				names = append(names, a)
			}
		}
		rows = append(rows, helpRow{names: append(names, c.Name), description: summarize(c.Description), basic: c.Basic})
	}
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := rows[i].names, rows[j].names
		return a[len(a)-1] < b[len(b)-1]
	})
	return rows
}

var sentenceEnd = regexp.MustCompile(`[^.]\.(\s|$)`)

// summarize is the first sentence of the first line, without its period.
func summarize(desc string) string {
	first := strings.Split(strings.TrimSpace(desc), "\n")[0]
	if loc := sentenceEnd.FindStringIndex(first); loc != nil {
		first = first[:loc[0]+2]
	}
	return strings.TrimSuffix(first, ".")
}

// commandRows pads labels to the widest in all rows; descriptions wrap to
// at least 30 columns.
func commandRows(rows, all []helpRow, columns int) string {
	label := func(r helpRow) string { return strings.Join(r.names, " | ") }
	width := 0
	for _, r := range all {
		width = max(width, len(label(r)))
	}
	descIndent := 6 + width + 2
	descWidth := max(30, columns-descIndent)
	var out []string
	for _, r := range rows {
		lines := wrap(r.description, descWidth)
		out = append(out, "      "+iostreams.Pad(label(r), width)+"  "+lines[0])
		for _, l := range lines[1:] {
			out = append(out, strings.Repeat(" ", descIndent)+l)
		}
	}
	return strings.Join(out, "\n")
}
