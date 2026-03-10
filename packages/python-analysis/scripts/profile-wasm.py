#!/usr/bin/env python3
"""WASM binary size analysis with flamegraph output.

Builds an analysis WASM with debug info and a linker map, then uses twiggy
and inferno-flamegraph to produce interactive SVG flamegraphs of code and
data size attribution by crate.

Required tools: wasm-tools, twiggy, rustfilt, inferno (inferno-flamegraph).
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent.parent
TARGET_DIR = PACKAGE_DIR / "target"

COMPONENT_MAGIC = b"\x00asm\x0d\x00\x01\x00"
MODULE_MAGIC = b"\x00asm\x01\x00\x00\x00"

# ---------------------------------------------------------------------------
# Terminal formatting helpers
# ---------------------------------------------------------------------------

_COLOR = sys.stdout.isatty()
_TERM_WIDTH = shutil.get_terminal_size((80, 24)).columns


def _sgr(code):
    return f"\033[{code}m" if _COLOR else ""


RESET = _sgr(0)
BOLD = _sgr(1)
DIM = _sgr(2)
RED = _sgr(31)
GREEN = _sgr(32)
YELLOW = _sgr(33)
BLUE = _sgr(34)
MAGENTA = _sgr(35)
CYAN = _sgr(36)
WHITE = _sgr(37)
BG_GREEN = _sgr(42)
BG_BLUE = _sgr(44)
BG_MAGENTA = _sgr(45)
BG_CYAN = _sgr(46)

# Bar chart characters (use ASCII if not a capable terminal)
BAR_FULL = "\u2588"    # █
BAR_7_8 = "\u2589"
BAR_3_4 = "\u258a"
BAR_5_8 = "\u258b"
BAR_HALF = "\u258c"    # ▌
BAR_3_8 = "\u258d"
BAR_1_4 = "\u258e"
BAR_1_8 = "\u258f"
BAR_CHARS = [" ", BAR_1_8, BAR_1_4, BAR_3_8, BAR_HALF, BAR_5_8, BAR_3_4, BAR_7_8, BAR_FULL]


def bar(fraction, width=20, color=CYAN):
    """Render a horizontal bar of the given fractional width."""
    if not _COLOR:
        filled = int(fraction * width)
        return "#" * filled + "-" * (width - filled)
    full_blocks = int(fraction * width)
    remainder = (fraction * width) - full_blocks
    partial_idx = int(remainder * 8)
    result = BAR_FULL * full_blocks
    if full_blocks < width:
        result += BAR_CHARS[partial_idx]
        result += " " * (width - full_blocks - 1)
    return f"{color}{result}{RESET}"


def step(num, total, msg):
    """Print a step progress line."""
    print(f"  {DIM}[{num}/{total}]{RESET} {msg}")


def header(title):
    """Print a section header."""
    print(f"\n{BOLD}{title}{RESET}")
    print(f"{DIM}{'─' * min(len(title) + 4, _TERM_WIDTH)}{RESET}")


def format_bytes(n):
    """Human-readable byte size."""
    if n >= 1_048_576:
        return f"{n / 1_048_576:.2f} MB"
    if n >= 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n} B"


def format_bytes_long(n):
    """Verbose byte size: '1,234 bytes (1.2 KB)'."""
    return f"{n:,} bytes ({format_bytes(n)})"


# ---------------------------------------------------------------------------
# Subprocess helpers
# ---------------------------------------------------------------------------


def run(cmd, *, input=None, capture=True, env=None, cwd=None, check=True):
    """Run a subprocess, returning stdout."""
    merged_env = {**os.environ, **(env or {})}
    result = subprocess.run(
        cmd,
        input=input,
        capture_output=capture,
        text=True,
        env=merged_env,
        cwd=cwd,
        check=check,
    )
    return result.stdout if capture else None


def check_tools():
    """Verify required tools are available."""
    tools = {
        "wasm-tools": ["wasm-tools", "--version"],
        "twiggy": ["twiggy", "--version"],
        "rustfilt": ["rustfilt", "--version"],
        "inferno-flamegraph": ["inferno-flamegraph", "--help"],
    }
    missing = []
    for name, cmd in tools.items():
        try:
            subprocess.run(cmd, capture_output=True, check=True)
        except FileNotFoundError:
            missing.append(name)
    if missing:
        print(f"{RED}Error: missing tools: {', '.join(missing)}{RESET}", file=sys.stderr)
        print(f"Install with: {BOLD}cargo install {' '.join(missing)}{RESET}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Build & extraction
# ---------------------------------------------------------------------------


def build_wasm(output_dir, profile):
    """Build the WASM component with debug info and linker map."""
    map_path = output_dir / "wasm.map"
    env = {
        "RUSTFLAGS": f"-C debuginfo=2 -C link-arg=--Map={map_path}",
    }
    if profile == "release-debug":
        # Override workspace release profile without modifying Cargo.toml
        env["CARGO_PROFILE_RELEASE_STRIP"] = "false"
        env["CARGO_PROFILE_RELEASE_DEBUG"] = "2"
        cargo_profile = "release"
    else:
        cargo_profile = profile

    cmd = [
        "cargo", "build",
        "--target", "wasm32-wasip2",
        "--profile", cargo_profile,
    ]
    run(cmd, capture=False, env=env, cwd=PACKAGE_DIR)

    wasm_path = TARGET_DIR / "wasm32-wasip2" / cargo_profile / "vercel_python_analysis.wasm"
    if not wasm_path.exists():
        print(f"{RED}Error: expected WASM at {wasm_path}{RESET}", file=sys.stderr)
        sys.exit(1)

    return wasm_path, map_path


def extract_core_module(component_path, output_path):
    """Extract the first core module from a component-model WASM."""
    dump = run(["wasm-tools", "objdump", str(component_path)])

    for line in dump.splitlines():
        m = re.match(
            r"\s*module\b.*?\|\s*(0x[0-9a-fA-F]+)\s*-\s*(0x[0-9a-fA-F]+)\s*\|\s*(\d+)\s*bytes",
            line,
        )
        if m:
            offset = int(m.group(1), 16)
            end = int(m.group(2), 16)
            size = int(m.group(3))
            break
    else:
        data = component_path.read_bytes()
        pos = data.find(MODULE_MAGIC, len(COMPONENT_MAGIC))
        if pos < 0:
            print(f"{RED}Error: could not find core module in component{RESET}", file=sys.stderr)
            sys.exit(1)
        print(f"{YELLOW}Warning: using fallback module extraction (size may be approximate){RESET}")
        output_path.write_bytes(data[pos:])
        return output_path

    data = component_path.read_bytes()
    output_path.write_bytes(data[offset:end])
    return output_path


# ---------------------------------------------------------------------------
# Twiggy analysis
# ---------------------------------------------------------------------------


def run_twiggy(core_wasm):
    """Run twiggy top to get item-level size data."""
    out = run(["twiggy", "top", str(core_wasm), "-n", "9999", "--format", "json"])
    return json.loads(out)


# ---------------------------------------------------------------------------
# Linker map parsing
# ---------------------------------------------------------------------------


def parse_linker_map(map_path):
    """Parse wasm-ld linker map for crate-level attribution.

    The wasm-ld --Map format has this structure:
        Addr      Off     Size Out     In      Symbol
           -     <off>   <size> CODE                          # top-level wasm section
           -     <off>     <sz>         <object>:(<section>)  # object file contribution
           -     <off>     <sz>                 <symbol>       # symbol within object
      <addr>     <off>   <size> .rodata                       # data sub-section
      <addr>     <off>     <sz>         <object>:(<section>)  # object file contribution

    Returns (entries, section_sizes) where:
      entries: list of (section, crate, symbol, size) tuples
      section_sizes: dict mapping section name to total size from the map header
    """
    if not map_path.exists():
        print(f"{YELLOW}Warning: linker map not found at {map_path}{RESET}", file=sys.stderr)
        return [], {}

    entries = []
    section_sizes = {}
    current_section = None   # top-level: CODE, DATA
    current_subsection = None  # e.g. .rodata, .data
    text = map_path.read_text()

    # Only match known wasm-ld section names — not arbitrary symbol lines
    # like ".Lanon.<hash>" which would falsely trigger a section switch.
    section_re = re.compile(
        r"^\s+(?:-|[0-9a-fA-F]+)\s+[0-9a-fA-F]+\s+([0-9a-fA-F]+)\s+"
        r"(CODE|DATA|CUSTOM\(.*?\)|\.rodata|\.data(?:\.rel\.ro)?|\.bss|"
        r"TYPE|IMPORT|FUNCTION|TABLE|MEMORY|GLOBAL|EXPORT|ELEM)\s*$"
    )
    obj_re = re.compile(
        r"^\s+(?:-|[0-9a-fA-F]+)\s+[0-9a-fA-F]+\s+([0-9a-fA-F]+)\s+(.+:.+)$"
    )
    for line in text.splitlines():
        sm = section_re.match(line)
        if sm:
            size = int(sm.group(1), 16)
            name = sm.group(2)
            section_sizes[name] = size
            if name.startswith("."):
                current_subsection = name
            else:
                current_section = name
                current_subsection = None
            continue

        om = obj_re.match(line)
        if om:
            size = int(om.group(1), 16)
            detail = om.group(2).strip()
            if size == 0:
                continue
            section = current_subsection or current_section
            if section not in ("CODE", ".rodata", ".data", ".data.rel.ro", ".bss"):
                continue
            crate = extract_crate_name(detail)
            symbol = extract_symbol(detail)
            entries.append((section, crate, symbol, size))
            continue

    return entries, section_sizes


def extract_crate_name(object_detail):
    """Extract crate name from linker map object file path.

    Object paths look like:
      deps/vercel_python_analysis.vercel_python_analysis.<hash>-cgu.<N>.rcgu.o:(sym)
      deps/libuv_pep508-<hash>.rlib(uv_pep508-<hash>.<crate>.<hash>-cgu.<N>.rcgu.o):(sym)
      /...rustlib/.../libstd-<hash>.rlib(std-<hash>.std.<hash>-cgu.<N>.rcgu.o):(sym)
      <internal>:(sym)
    """
    if "<internal>" in object_detail:
        return "<linker>"

    m = re.search(r"\.rlib\(([a-zA-Z_][a-zA-Z0-9_]*)-", object_detail)
    if m:
        return m.group(1)

    m = re.search(r"deps/([a-zA-Z_][a-zA-Z0-9_]*)\.\1\.", object_detail)
    if m:
        return m.group(1)

    return "<unknown>"


def extract_symbol(detail):
    """Extract a symbol name from a linker map entry, if present."""
    m = re.search(r":\((.+?)\)", detail)
    if m:
        return m.group(1)
    return ""


def demangle_symbols(entries):
    """Demangle Rust symbols using rustfilt."""
    symbols = [e[2] for e in entries if e[2]]
    if not symbols:
        return entries

    try:
        demangled = run(["rustfilt"], input="\n".join(symbols))
        demangled_list = demangled.strip().split("\n")
    except Exception:
        return entries

    result = []
    demangle_idx = 0
    for section, crate, symbol, size in entries:
        if symbol:
            if demangle_idx < len(demangled_list):
                symbol = demangled_list[demangle_idx]
            demangle_idx += 1
            # With LTO, all code is merged into one object file, so the
            # object-based crate is just the top-level crate.  Recover the
            # real originating crate from the demangled symbol path.
            sym_crate = crate_from_symbol(symbol)
            if sym_crate:
                crate = sym_crate
        result.append((section, crate, symbol, size))
    return result


def crate_from_symbol(symbol):
    """Extract the originating crate name from a demangled Rust symbol.

    Demangled symbols look like:
      uv_pep508::marker::simplify::collect_dnf
      core::num::flt2dec::strategy::dragon::format_shortest
      <uv_pep508::Requirement<T> as core::fmt::Display>::fmt
      .rodata.core::num::dec2flt::table::POWER_OF_FIVE_128
      .rodata..Lanon.f2a1a4d36baa2f0507e070ce676efac8.547
    """
    # Strip .rodata. prefix from data segment symbols
    s = re.sub(r"^\.rodata\.", "", symbol)
    # Skip anonymous data segments — no crate info available
    if s.startswith(".Lanon.") or s.startswith("anon."):
        return None
    s = s.lstrip("<")
    m = re.match(r"([a-zA-Z_][a-zA-Z0-9_]*)::", s)
    if m:
        return m.group(1)
    return None


# ---------------------------------------------------------------------------
# Aggregation & flamegraph generation
# ---------------------------------------------------------------------------


def aggregate_by_crate(entries):
    """Aggregate sizes by crate and section type."""
    crate_sizes = defaultdict(lambda: {"code": 0, "rodata": 0, "data": 0, "total": 0})

    for section, crate, _symbol, size in entries:
        if section == "CODE":
            crate_sizes[crate]["code"] += size
        elif section == ".rodata":
            crate_sizes[crate]["rodata"] += size
        elif section in (".data", ".bss", ".data.rel.ro"):
            crate_sizes[crate]["data"] += size
        else:
            continue
        crate_sizes[crate]["total"] += size

    return dict(crate_sizes)


def build_folded_stacks(entries, category):
    """Build folded-stack format for inferno-flamegraph.

    category: 'code' for CODE sections, 'data' for .rodata/.data sections,
              'all' for everything.
    """
    stacks = defaultdict(int)

    for section, crate, symbol, size in entries:
        is_code = section == "CODE"
        is_data = section in (".rodata", ".data", ".bss", ".data.rel.ro")

        if category == "code" and not is_code:
            continue
        if category == "data" and not is_data:
            continue
        if category == "all" and not (is_code or is_data):
            continue

        parts = [crate]
        if category == "all":
            parts.append("code" if is_code else "data")
        if symbol:
            sym_parts = symbol_to_path(symbol)
            parts.extend(sym_parts)
        else:
            parts.append(section)

        stack = ";".join(parts)
        stacks[stack] += size

    lines = []
    for stack_key, size in sorted(stacks.items()):
        lines.append(f"{stack_key} {size}")
    return "\n".join(lines)


def symbol_to_path(symbol):
    """Break a demangled symbol into path components for flamegraph hierarchy."""
    symbol = re.sub(r"::h[0-9a-f]{8,16}$", "", symbol)
    parts = symbol.split("::")
    if len(parts) > 4:
        parts = parts[:3] + ["::".join(parts[3:])]
    return parts


def generate_flamegraph(folded_stacks, output_path, title):
    """Generate a flamegraph SVG using inferno-flamegraph."""
    if not folded_stacks.strip():
        return False

    svg = run(
        [
            "inferno-flamegraph",
            "--title", title,
            "--countname", "bytes",
            "--nametype", "Item:",
        ],
        input=folded_stacks,
    )
    output_path.write_text(svg)
    return True


# ---------------------------------------------------------------------------
# Report rendering (terminal)
# ---------------------------------------------------------------------------

# Color palette for crate bars (cycles through these)
_CRATE_COLORS = [CYAN, GREEN, YELLOW, MAGENTA, BLUE]


def render_overview(section_sizes):
    """Render the binary overview section using authoritative section sizes."""
    total_code = section_sizes.get("CODE", 0)
    total_rodata = section_sizes.get(".rodata", 0)
    total_data_seg = section_sizes.get(".data", 0) + section_sizes.get(".bss", 0)
    total_data = total_rodata + total_data_seg
    total = total_code + total_data

    header("Binary Overview")
    print(f"  {'Total (code+data):':<20} {BOLD}{format_bytes_long(total)}{RESET}")
    if total == 0:
        return

    code_frac = total_code / total
    data_frac = total_data / total

    print()
    print(f"  {'Code:':<20} {format_bytes(total_code):>10}  {bar(code_frac, 30, CYAN)}  {code_frac*100:5.1f}%")
    print(f"  {'Data:':<20} {format_bytes(total_data):>10}  {bar(data_frac, 30, MAGENTA)}  {data_frac*100:5.1f}%")
    print(f"    {DIM}.rodata:{RESET}         {format_bytes(total_rodata):>10}")
    print(f"    {DIM}.data+.bss:{RESET}      {format_bytes(total_data_seg):>10}")

    # Combined stacked bar showing code vs data
    print()
    bar_w = min(60, _TERM_WIDTH - 20)
    code_w = max(1, int(code_frac * bar_w))
    data_w = max(1, bar_w - code_w)
    code_bar = f"{BG_CYAN}{' ' * code_w}{RESET}"
    data_bar = f"{BG_MAGENTA}{' ' * data_w}{RESET}"
    print(f"  {code_bar}{data_bar}")
    lbl_code = f"{CYAN}code {code_frac*100:.0f}%{RESET}"
    lbl_data = f"{MAGENTA}data {data_frac*100:.0f}%{RESET}"
    print(f"  {lbl_code}{' ' * max(1, bar_w - 18)}{lbl_data}")


def render_crate_table(title, crate_sizes, section_sizes, top_n):
    """Render a ranked table of crates with inline bars and code/data split.

    crate_sizes: dict of crate -> {"code": N, "rodata": N, "data": N, "total": N}
    section_sizes: authoritative section totals from the map header.
    """
    header(title)
    if not crate_sizes:
        print(f"  {DIM}(no data){RESET}")
        return

    total = section_sizes.get("CODE", 0) + section_sizes.get(".rodata", 0) + \
            section_sizes.get(".data", 0) + section_sizes.get(".bss", 0)
    sorted_crates = sorted(crate_sizes.items(), key=lambda x: x[1]["total"], reverse=True)
    max_size = sorted_crates[0][1]["total"] if sorted_crates else 1
    name_w = max(len(c) for c, _ in sorted_crates[:top_n])
    name_w = max(name_w, 10)

    # Header row
    print(f"       {'':>{name_w}}  {'total':>10}  {'code':>10}  {'data':>10}  {'':20}  {'%':>5}")
    print(f"  {DIM}{'─' * (name_w + 72)}{RESET}")

    for i, (name, sizes) in enumerate(sorted_crates[:top_n], 1):
        pct = 100 * sizes["total"] / total if total else 0
        frac = sizes["total"] / max_size if max_size else 0
        data_sz = sizes["rodata"] + sizes["data"]
        c = _CRATE_COLORS[i % len(_CRATE_COLORS)]

        # Stacked bar: code portion in cyan, data portion in magenta
        bar_w = 20
        if sizes["total"] > 0:
            code_frac_of_bar = sizes["code"] / sizes["total"]
        else:
            code_frac_of_bar = 0
        full = int(frac * bar_w)
        code_part = int(code_frac_of_bar * full)
        data_part = full - code_part
        empty = bar_w - full
        if _COLOR:
            stacked = (f"{CYAN}{BAR_FULL * code_part}{RESET}"
                       f"{MAGENTA}{BAR_FULL * data_part}{RESET}"
                       f"{' ' * empty}")
        else:
            stacked = "#" * code_part + "=" * data_part + "-" * empty

        print(
            f"  {DIM}{i:>3}.{RESET} {name:<{name_w}}  "
            f"{format_bytes(sizes['total']):>10}  "
            f"{CYAN}{format_bytes(sizes['code']):>10}{RESET}  "
            f"{MAGENTA}{format_bytes(data_sz):>10}{RESET}  "
            f"{stacked}  "
            f"{DIM}{pct:5.1f}%{RESET}"
        )


def shorten_symbol(crate, symbol):
    """Produce a display label for an item, stripping redundant crate prefix."""
    if not symbol:
        return ""
    # Strip crate:: prefix if the symbol starts with it (common with LTO)
    prefix = crate + "::"
    if symbol.startswith(prefix):
        return symbol[len(prefix):]
    return symbol


def render_items_table(entries, top_n):
    """Render the top items table with a two-line layout per item."""
    header(f"Top {top_n} Items by Size")
    sorted_items = sorted(entries, key=lambda x: x[3], reverse=True)
    if not sorted_items:
        print(f"  {DIM}(no data){RESET}")
        return

    max_size = sorted_items[0][3]
    total_size = sum(e[3] for e in sorted_items)
    # Bar fills the available width minus the fixed-width suffix
    bar_w = max(10, _TERM_WIDTH - 30)  # leave room for size + pct

    for i, (section, crate, symbol, size) in enumerate(sorted_items[:top_n], 1):
        short = shorten_symbol(crate, symbol)
        is_code = section == "CODE"
        c = CYAN if is_code else MAGENTA
        kind_tag = f"{CYAN}fn{RESET}" if is_code else f"{MAGENTA}data{RESET}"

        # Line 1: rank, kind, crate :: symbol (full width, truncate if needed)
        if short:
            sym_display = short
        else:
            sym_display = f"[{section}]"
        max_sym = _TERM_WIDTH - len(crate) - 16  # rank(6) + kind(4) + " :: "(4) + margin
        if len(sym_display) > max_sym > 10:
            sym_display = sym_display[:max_sym - 1] + "\u2026"

        if short:
            line1_label = f"{BOLD}{crate}{RESET}{DIM}::{RESET}{sym_display}"
        else:
            line1_label = f"{BOLD}{crate}{RESET}  {DIM}{sym_display}{RESET}"

        print(f"  {DIM}{i:>3}.{RESET} {kind_tag}  {line1_label}")

        # Line 2: bar + size + percentage
        frac = size / max_size if max_size else 0
        pct = 100 * size / total_size if total_size else 0
        print(f"       {bar(frac, bar_w, c)}  {format_bytes(size):>10} {DIM}{pct:5.1f}%{RESET}")


def hyperlink(url, text):
    """Wrap text in an OSC 8 terminal hyperlink if color is enabled."""
    if not _COLOR:
        return text
    return f"\033]8;;{url}\033\\{text}\033]8;;\033\\"


def file_url(path):
    """Convert a Path to a file:// URL."""
    return Path(path).resolve().as_uri()


def render_flamegraph_links(output_dir):
    """Render links to generated flamegraphs."""
    header("Flamegraphs")
    svgs = [
        ("code-flamegraph.svg", "Code size by crate", CYAN),
        ("data-flamegraph.svg", "Data size by crate", MAGENTA),
        ("combined-flamegraph.svg", "Combined (code + data)", BLUE),
    ]
    for filename, desc, c in svgs:
        p = output_dir / filename
        if p.exists():
            sz = format_bytes(p.stat().st_size)
            link = hyperlink(file_url(p), str(p))
            print(f"  {c}{BAR_FULL}{RESET} {desc}")
            print(f"    {DIM}{link} ({sz}){RESET}")


# ---------------------------------------------------------------------------
# Plain-text report (for report.txt, no ANSI codes)
# ---------------------------------------------------------------------------


def generate_plain_report(section_sizes, crate_sizes, entries, top_n):
    """Generate a plain-text report (no colors) for file output."""
    total_code = section_sizes.get("CODE", 0)
    total_rodata = section_sizes.get(".rodata", 0)
    total_data_seg = section_sizes.get(".data", 0) + section_sizes.get(".bss", 0)
    total_data = total_rodata + total_data_seg
    total = total_code + total_data

    lines = []
    lines.append("=== WASM Binary Size Analysis ===")
    lines.append(f"Total (code+data): {format_bytes_long(total)}")
    if total > 0:
        lines.append(f"  Code:      {total_code:>10,} bytes ({100*total_code/total:.1f}%)")
        lines.append(f"  Data:      {total_data:>10,} bytes ({100*total_data/total:.1f}%)")
        lines.append(f"    .rodata: {total_rodata:>10,} bytes")
        lines.append(f"    .data:   {total_data_seg:>10,} bytes")
    lines.append("")

    sorted_crates = sorted(crate_sizes.items(), key=lambda x: x[1]["total"], reverse=True)
    lines.append(f"=== Top {min(top_n, len(sorted_crates))} Crates by Size ===")
    lines.append(f"  {'#':>3}  {'crate':<30} {'total':>10}  {'code':>10}  {'data':>10}  {'%':>5}")
    for i, (crate, sizes) in enumerate(sorted_crates[:top_n], 1):
        pct = 100 * sizes["total"] / total if total else 0
        data_sz = sizes["rodata"] + sizes["data"]
        lines.append(
            f"  {i:3}. {crate:<30} {sizes['total']:>10,}  {sizes['code']:>10,}  {data_sz:>10,}  {pct:5.1f}%"
        )
    lines.append("")

    sorted_items = sorted(entries, key=lambda x: x[3], reverse=True)
    lines.append(f"=== Top {min(top_n, len(sorted_items))} Items by Size ===")
    for i, (section, crate, symbol, size) in enumerate(sorted_items[:top_n], 1):
        label = symbol if symbol else f"[{section}]"
        lines.append(f"  {i:3}. {crate:<25} {label:<50} {size:>10,} bytes")
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="WASM binary size analysis with flamegraph output.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
examples:
  %(prog)s                      Build & analyze (analysis profile)
  %(prog)s --skip-build         Reuse previous build artifacts
  %(prog)s --top 15             Show top 15 items per section
  %(prog)s --profile release-debug   Match exact release binary

output:
  target/wasm-analysis/report.txt           Text summary
  target/wasm-analysis/code-flamegraph.svg  Interactive code size flamegraph
  target/wasm-analysis/data-flamegraph.svg  Interactive data size flamegraph
  target/wasm-analysis/combined-flamegraph.svg  Combined flamegraph
""",
    )
    parser.add_argument(
        "--skip-build", action="store_true",
        help="reuse existing build artifacts (skip cargo build)",
    )
    parser.add_argument(
        "--profile",
        choices=["analysis", "release-debug"],
        default="analysis",
        help="build profile: 'analysis' (default, matches release DCE) or "
             "'release-debug' (overrides release profile with debug info)",
    )
    parser.add_argument(
        "--top", type=int, default=30, metavar="N",
        help="number of top items to show per section (default: 30)",
    )
    parser.add_argument(
        "--output-dir", type=Path, default=None, metavar="DIR",
        help="output directory (default: target/wasm-analysis/)",
    )
    args = parser.parse_args()

    output_dir = args.output_dir or TARGET_DIR / "wasm-analysis"
    output_dir.mkdir(parents=True, exist_ok=True)

    total_steps = 5

    # ── Step 0: Check tools ─────────────────────────────────────────────
    check_tools()

    # ── Step 1: Build ───────────────────────────────────────────────────
    cargo_profile = "release" if args.profile == "release-debug" else args.profile
    wasm_path = TARGET_DIR / "wasm32-wasip2" / cargo_profile / "vercel_python_analysis.wasm"
    map_path = output_dir / "wasm.map"

    if args.skip_build:
        if not wasm_path.exists():
            print(f"{RED}Error: no existing build at {wasm_path}{RESET}", file=sys.stderr)
            sys.exit(1)
        step(1, total_steps, f"Build {DIM}(skipped, reusing {wasm_path.name}){RESET}")
    else:
        step(1, total_steps, f"Building with profile {BOLD}{args.profile}{RESET} ...")
        wasm_path, map_path = build_wasm(output_dir, args.profile)

    # ── Step 2: Extract core module ─────────────────────────────────────
    core_wasm = output_dir / "core.wasm"
    step(2, total_steps, "Extracting core module from component ...")
    extract_core_module(wasm_path, core_wasm)
    core_size = core_wasm.stat().st_size

    # ── Step 3: Run twiggy ──────────────────────────────────────────────
    step(3, total_steps, "Running twiggy size profiler ...")
    twiggy_data = run_twiggy(core_wasm)

    # ── Step 4: Parse linker map ────────────────────────────────────────
    step(4, total_steps, "Parsing linker map & demangling symbols ...")
    entries, section_sizes = parse_linker_map(map_path)
    entries = demangle_symbols(entries)
    crate_sizes = aggregate_by_crate(entries)

    # ── Step 5: Generate flamegraphs ────────────────────────────────────
    step(5, total_steps, "Generating flamegraphs ...")
    code_stacks = build_folded_stacks(entries, "code")
    data_stacks = build_folded_stacks(entries, "data")
    combined_stacks = build_folded_stacks(entries, "all")

    generate_flamegraph(code_stacks, output_dir / "code-flamegraph.svg", "WASM Code Size by Crate")
    generate_flamegraph(data_stacks, output_dir / "data-flamegraph.svg", "WASM Data Size by Crate")
    generate_flamegraph(combined_stacks, output_dir / "combined-flamegraph.svg", "WASM Total Size by Crate (Code + Data)")

    # ── Render terminal report ──────────────────────────────────────────
    render_overview(section_sizes)
    render_crate_table(f"Top {min(args.top, len(crate_sizes))} Crates by Size",
                       crate_sizes, section_sizes, args.top)
    render_items_table(entries, args.top)
    render_flamegraph_links(output_dir)

    # ── Write plain-text report to file ─────────────────────────────────
    report = generate_plain_report(section_sizes, crate_sizes, entries, args.top)
    report_path = output_dir / "report.txt"
    report_path.write_text(report)
    report_link = hyperlink(file_url(report_path), str(report_path))
    print(f"\n  {DIM}Report written to: {report_link}{RESET}")


if __name__ == "__main__":
    main()
