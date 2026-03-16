// Derived from the regex crate (https://github.com/rust-lang/regex).
// Copyright (c) The Rust Project Developers.
// Licensed under the Apache License, Version 2.0 or the MIT License.

//! Pattern translation: Rust regex AST -> JS RegExp syntax.
//!
//! Parses a Rust regex pattern with `regex-syntax`, validates it for
//! JS-backend compatibility, and emits JS `RegExp` source + flags.

use std::fmt::Write as _;

use regex_syntax::ast::{
    self as re_ast, Ast, ClassAsciiKind, ClassSetBinaryOpKind,
};

use crate::Error;

/// Emit a JS-compatible pattern from a regex-syntax AST.
///
/// Returns `(source, flags)`.
pub(crate) fn emit_to_js(
    ast: &Ast,
) -> Result<(String, String), Error> {
    validate_ast(ast)?;

    let mut ctx = EmitCtx {
        out: String::with_capacity(128),
        flags: String::new(),
        in_class: false,
    };

    // Extract a leading `(?flags)` at the start of the pattern into
    // JS constructor flags.  JS doesn't support standalone inline
    // flag groups like `(?m)`, so we must extract them.  Only pure
    // i/m/s (no negation) are extractable.
    //
    // The leading SetFlags can appear in the AST as:
    //   a) Top-level Group(NonCapturing(flags)) wrapping the entire
    //      pattern
    //   b) First child of a top-level Concat
    //   c) First child of the first branch of a top-level
    //      Alternation
    //   d) Standalone SetFlags node

    // Case (a): (?ims)rest  parsed as Group(NonCapturing(ims), rest)
    if let Ast::Group(g) = ast
        && let re_ast::GroupKind::NonCapturing(ref fl) = g.kind
        && g.span.start.offset == 0
        && flags_are_extractable(fl)
    {
        extract_flags(fl, &mut ctx.flags);
        emit(&g.ast, &mut ctx)?;
        return Ok((ctx.out, ctx.flags));
    }

    // Cases (b), (c), (d): extract leading SetFlags and emit rest.
    if !try_extract_leading_flags(ast, &mut ctx)? {
        emit(ast, &mut ctx)?;
    }

    Ok((ctx.out, ctx.flags))
}

// -------------------------------------------------------------------
// Emitter context and helpers
// -------------------------------------------------------------------

/// Context for the recursive AST-to-JS emitter.
struct EmitCtx {
    out: String,
    flags: String,
    in_class: bool,
}

/// If the AST starts with an extractable SetFlags at offset 0
/// (standalone, first child of Concat, or first child of the first
/// Alternation branch), extract the flags into `ctx.flags` and emit
/// the remaining AST.  Returns `true` if flags were found and
/// handled; the caller should only call `emit(ast, ctx)` when this
/// returns `false`.
fn try_extract_leading_flags(
    ast: &Ast,
    ctx: &mut EmitCtx,
) -> Result<bool, Error> {
    match ast {
        // Case (d): standalone SetFlags
        Ast::Flags(sf)
            if sf.span.start.offset == 0
                && flags_are_extractable(&sf.flags) =>
        {
            extract_flags(&sf.flags, &mut ctx.flags);
            Ok(true) // nothing left to emit
        }
        // Case (b): first child of Concat
        Ast::Concat(cat) => {
            let Some(Ast::Flags(sf)) = cat.asts.first() else {
                return Ok(false);
            };
            if sf.span.start.offset != 0
                || !flags_are_extractable(&sf.flags)
            {
                return Ok(false);
            }
            extract_flags(&sf.flags, &mut ctx.flags);
            for child in &cat.asts[1..] {
                emit(child, ctx)?;
            }
            Ok(true)
        }
        // Case (c): SetFlags in the first Alternation branch
        Ast::Alternation(alt) => {
            // Find and extract the leading SetFlags, recording
            // any remaining children in the first branch.
            let rest: &[Ast] = match alt.asts.first() {
                Some(Ast::Flags(sf))
                    if sf.span.start.offset == 0
                        && flags_are_extractable(&sf.flags) =>
                {
                    extract_flags(&sf.flags, &mut ctx.flags);
                    &[] // standalone flag, nothing else
                }
                Some(Ast::Concat(cat)) => {
                    let Some(Ast::Flags(sf)) =
                        cat.asts.first()
                    else {
                        return Ok(false);
                    };
                    if sf.span.start.offset != 0
                        || !flags_are_extractable(&sf.flags)
                    {
                        return Ok(false);
                    }
                    extract_flags(&sf.flags, &mut ctx.flags);
                    &cat.asts[1..]
                }
                _ => return Ok(false),
            };
            // Emit remaining children of the first branch.
            for child in rest {
                emit(child, ctx)?;
            }
            for branch in &alt.asts[1..] {
                ctx.out.push('|');
                emit(branch, ctx)?;
            }
            Ok(true)
        }
        _ => Ok(false),
    }
}

/// Return true if these flags contain only i/m/s (no negation, no
/// other flags) and thus can be extracted to JS constructor flags.
fn flags_are_extractable(flags: &re_ast::Flags) -> bool {
    for item in &flags.items {
        match item.kind {
            re_ast::FlagsItemKind::Negation => return false,
            re_ast::FlagsItemKind::Flag(f) => match f {
                re_ast::Flag::CaseInsensitive
                | re_ast::Flag::MultiLine
                | re_ast::Flag::DotMatchesNewLine => {}
                _ => return false,
            },
        }
    }
    true
}

/// Convert AST flag nodes to JS constructor flag characters (i/m/s),
/// deduplicating so each flag appears at most once.
fn extract_flags(flags: &re_ast::Flags, out: &mut String) {
    for item in &flags.items {
        if let re_ast::FlagsItemKind::Flag(f) = item.kind {
            let ch = match f {
                re_ast::Flag::CaseInsensitive => 'i',
                re_ast::Flag::MultiLine => 'm',
                re_ast::Flag::DotMatchesNewLine => 's',
                _ => continue,
            };
            if !out.contains(ch) {
                out.push(ch);
            }
        }
    }
}

// -------------------------------------------------------------------
// Literal and class emission
// -------------------------------------------------------------------

/// Characters that must be escaped inside `[...]` in JS `v` mode.
fn needs_class_escape(c: char) -> bool {
    matches!(
        c,
        '(' | ')' | '[' | ']' | '{' | '}' | '/' | '|' | '\\'
    )
}

/// Translate a literal to JS syntax, handling v-mode escaping of
/// `}`, `\a` to `\x07`, `\U` to `\u{...}`, and octal to hex
/// conversion (JS unicode mode rejects octal escapes).
fn emit_literal(lit: &re_ast::Literal, ctx: &mut EmitCtx) {
    let c = lit.c;

    // `\-` (Superfluous escape on '-'): keep `\-` inside class,
    // bare `-` outside.
    if matches!(lit.kind, re_ast::LiteralKind::Superfluous)
        && c == '-'
    {
        if ctx.in_class {
            ctx.out.push_str("\\-");
        } else {
            ctx.out.push('-');
        }
        return;
    }

    if ctx.in_class && needs_class_escape(c) {
        ctx.out.push('\\');
        ctx.out.push(c);
        return;
    }

    // Outside classes: lone `{` or `}` must be escaped for JS
    // unicodeSets (v) mode.
    if !ctx.in_class && (c == '{' || c == '}') {
        ctx.out.push('\\');
        ctx.out.push(c);
        return;
    }

    // Preserve the original escape form for special literals and hex
    // escapes.
    match lit.kind {
        re_ast::LiteralKind::Special(ref sk) => {
            let esc = match sk {
                re_ast::SpecialLiteralKind::Bell => "\\x07",
                re_ast::SpecialLiteralKind::FormFeed => "\\f",
                re_ast::SpecialLiteralKind::Tab => "\\t",
                re_ast::SpecialLiteralKind::LineFeed => "\\n",
                re_ast::SpecialLiteralKind::CarriageReturn => {
                    "\\r"
                }
                re_ast::SpecialLiteralKind::VerticalTab => "\\v",
                re_ast::SpecialLiteralKind::Space => " ",
            };
            ctx.out.push_str(esc);
        }
        re_ast::LiteralKind::HexFixed(ref hk) => match hk {
            re_ast::HexLiteralKind::X => {
                write!(ctx.out, "\\x{:02X}", c as u32).unwrap();
            }
            re_ast::HexLiteralKind::UnicodeShort => {
                write!(ctx.out, "\\u{:04X}", c as u32).unwrap();
            }
            re_ast::HexLiteralKind::UnicodeLong => {
                // JS doesn't support \U; emit \u{...} instead.
                write!(ctx.out, "\\u{{{:X}}}", c as u32).unwrap();
            }
        },
        re_ast::LiteralKind::HexBrace(ref hk) => {
            let prefix = match hk {
                re_ast::HexLiteralKind::X => "\\x",
                // JS only supports \u{...} (lowercase); \U is not
                // valid.
                re_ast::HexLiteralKind::UnicodeShort
                | re_ast::HexLiteralKind::UnicodeLong => "\\u",
            };
            write!(ctx.out, "{prefix}{{{:X}}}", c as u32).unwrap();
        }
        re_ast::LiteralKind::Meta => {
            ctx.out.push('\\');
            ctx.out.push(c);
        }
        re_ast::LiteralKind::Superfluous => {
            // Superfluous escapes like `\%` -- in JS they may not be
            // valid escapes, so emit the char verbatim (except `-`
            // handled above).
            ctx.out.push(c);
        }
        re_ast::LiteralKind::Octal => {
            // JS doesn't support octal escapes in unicode mode; emit
            // as hex.
            if (c as u32) <= 0xFF {
                write!(ctx.out, "\\x{:02X}", c as u32).unwrap();
            } else {
                write!(ctx.out, "\\u{:04X}", c as u32).unwrap();
            }
        }
        re_ast::LiteralKind::Verbatim => {
            ctx.out.push(c);
        }
    }
}

/// Unicode word-character properties matching the Rust `regex` crate
/// `\w`.
const W: &str =
    r"\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}";

/// Translate Rust `\w`/`\d`/`\s` to Unicode-aware JS equivalents.
/// JS v-mode `\w` is ASCII-only, so we expand it to
/// `[\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}]` to match
/// Rust's Unicode-aware behavior.  `\d` and `\s` map to `\p{Nd}`
/// and `\p{White_Space}` respectively.
fn emit_perl_class(
    cls: &re_ast::ClassPerl,
    ctx: &mut EmitCtx,
) {
    match cls.kind {
        re_ast::ClassPerlKind::Word => {
            ctx.out
                .push_str(if cls.negated { "[^" } else { "[" });
            ctx.out.push_str(W);
            ctx.out.push(']');
        }
        re_ast::ClassPerlKind::Digit => {
            if cls.negated {
                ctx.out.push_str(r"\P{Nd}");
            } else {
                ctx.out.push_str(r"\p{Nd}");
            }
        }
        re_ast::ClassPerlKind::Space => {
            if cls.negated {
                ctx.out.push_str(r"\P{White_Space}");
            } else {
                ctx.out.push_str(r"\p{White_Space}");
            }
        }
    }
}

/// Translate `\p{...}`/`\P{...}` to JS syntax, normalizing the
/// Colon operator variant to `=` (JS only supports `=`/`!=`).
fn emit_unicode_class(
    cls: &re_ast::ClassUnicode,
    ctx: &mut EmitCtx,
) {
    let prefix = if cls.negated { r"\P" } else { r"\p" };
    match &cls.kind {
        re_ast::ClassUnicodeKind::OneLetter(c) => {
            write!(ctx.out, "{prefix}{{{c}}}").unwrap();
        }
        re_ast::ClassUnicodeKind::Named(name) => {
            write!(ctx.out, "{prefix}{{{name}}}").unwrap();
        }
        re_ast::ClassUnicodeKind::NamedValue {
            op,
            name,
            value,
        } => {
            let op_str = match op {
                re_ast::ClassUnicodeOpKind::Equal => "=",
                re_ast::ClassUnicodeOpKind::Colon => "=",
                re_ast::ClassUnicodeOpKind::NotEqual => "!=",
            };
            write!(
                ctx.out,
                "{prefix}{{{name}{op_str}{value}}}"
            )
            .unwrap();
        }
    }
}

/// Map POSIX class names to ASCII character ranges for use inside
/// JS `[...]` bracket expressions.
fn ascii_class_ranges(kind: &ClassAsciiKind) -> &'static str {
    match kind {
        ClassAsciiKind::Alpha => "A-Za-z",
        ClassAsciiKind::Lower => "a-z",
        ClassAsciiKind::Upper => "A-Z",
        ClassAsciiKind::Digit => "0-9",
        ClassAsciiKind::Xdigit => "0-9A-Fa-f",
        ClassAsciiKind::Alnum => "0-9A-Za-z",
        ClassAsciiKind::Word => "0-9A-Z_a-z",
        ClassAsciiKind::Ascii => "\\x00-\\x7F",
        ClassAsciiKind::Blank => "\\t\\x20",
        ClassAsciiKind::Space => {
            "\\t\\n\\x0B\\x0C\\r\\x20"
        }
        ClassAsciiKind::Cntrl => "\\x00-\\x1F\\x7F",
        ClassAsciiKind::Graph => "\\x21-\\x7E",
        ClassAsciiKind::Print => "\\x20-\\x7E",
        ClassAsciiKind::Punct => {
            "\\x21-\\x2F\\x3A-\\x40\\x5B-\\x60\\x7B-\\x7E"
        }
    }
}

/// Translate items within a `[...]` bracket expression: literals,
/// ranges, nested classes, POSIX classes, and set unions.
fn emit_class_set_item(
    item: &re_ast::ClassSetItem,
    ctx: &mut EmitCtx,
) -> Result<(), Error> {
    match item {
        re_ast::ClassSetItem::Empty(_) => {}
        re_ast::ClassSetItem::Literal(lit) => {
            emit_literal(lit, ctx);
        }
        re_ast::ClassSetItem::Range(r) => {
            emit_literal(&r.start, ctx);
            ctx.out.push('-');
            emit_literal(&r.end, ctx);
        }
        re_ast::ClassSetItem::Ascii(ascii) => {
            let ranges = ascii_class_ranges(&ascii.kind);
            if ascii.negated {
                // Negated POSIX class inside a bracket: use
                // nested negated class.
                write!(ctx.out, "[^{ranges}]").unwrap();
            } else {
                ctx.out.push_str(ranges);
            }
        }
        re_ast::ClassSetItem::Unicode(cls) => {
            emit_unicode_class(cls, ctx);
        }
        re_ast::ClassSetItem::Perl(cls) => {
            emit_perl_class(cls, ctx);
        }
        re_ast::ClassSetItem::Bracketed(nested) => {
            emit_bracketed_class(nested, ctx)?;
        }
        re_ast::ClassSetItem::Union(union) => {
            for sub_item in &union.items {
                emit_class_set_item(sub_item, ctx)?;
            }
        }
    }
    Ok(())
}

/// Translate a ClassSet, including JS v-mode set operations (`&&`
/// for intersection, `--` for difference).  Symmetric difference
/// (`~~`) has no JS equivalent and is rejected.
fn emit_class_set(
    set: &re_ast::ClassSet,
    ctx: &mut EmitCtx,
) -> Result<(), Error> {
    match set {
        re_ast::ClassSet::Item(item) => {
            emit_class_set_item(item, ctx)
        }
        re_ast::ClassSet::BinaryOp(op) => {
            match op.kind {
                ClassSetBinaryOpKind::Intersection => {
                    emit_class_set(&op.lhs, ctx)?;
                    ctx.out.push_str("&&");
                    emit_class_set(&op.rhs, ctx)?;
                }
                ClassSetBinaryOpKind::Difference => {
                    emit_class_set(&op.lhs, ctx)?;
                    ctx.out.push_str("--");
                    emit_class_set(&op.rhs, ctx)?;
                }
                ClassSetBinaryOpKind::SymmetricDifference => {
                    return Err(Error::unsupported(
                        "symmetric difference (~~ operator) \
                         in character classes is not supported \
                         by the JS regex backend",
                    ));
                }
            }
            Ok(())
        }
    }
}

/// Translate a bracketed class, setting `in_class` context so
/// nested emitters apply correct v-mode escaping.
fn emit_bracketed_class(
    cls: &re_ast::ClassBracketed,
    ctx: &mut EmitCtx,
) -> Result<(), Error> {
    if cls.negated {
        ctx.out.push_str("[^");
    } else {
        ctx.out.push('[');
    }
    let was_in_class = ctx.in_class;
    ctx.in_class = true;
    emit_class_set(&cls.kind, ctx)?;
    ctx.in_class = was_in_class;
    ctx.out.push(']');
    Ok(())
}

// -------------------------------------------------------------------
// Repetition, assertion, group, and top-level emission
// -------------------------------------------------------------------

/// Translate a repetition and its quantifier suffix, preserving
/// greedy/lazy semantics (syntax is the same in both engines).
fn emit_repetition_op(
    rep: &re_ast::Repetition,
    ctx: &mut EmitCtx,
) -> Result<(), Error> {
    emit(&rep.ast, ctx)?;
    match &rep.op.kind {
        re_ast::RepetitionKind::ZeroOrOne => ctx.out.push('?'),
        re_ast::RepetitionKind::ZeroOrMore => {
            ctx.out.push('*')
        }
        re_ast::RepetitionKind::OneOrMore => ctx.out.push('+'),
        re_ast::RepetitionKind::Range(range) => match range {
            re_ast::RepetitionRange::Exactly(n) => {
                write!(ctx.out, "{{{n}}}").unwrap();
            }
            re_ast::RepetitionRange::AtLeast(n) => {
                write!(ctx.out, "{{{n},}}").unwrap();
            }
            re_ast::RepetitionRange::Bounded(m, n) => {
                write!(ctx.out, "{{{m},{n}}}").unwrap();
            }
        },
    }
    if !rep.greedy {
        ctx.out.push('?');
    }
    Ok(())
}

/// Emit a Unicode word boundary or non-word-boundary assertion as
/// a lookaround pair over `\p{Alphabetic}` etc.
///
/// Word boundary: word-char on exactly one side.
/// Non-boundary: word-char on both sides or neither.
fn emit_word_boundary(ctx: &mut EmitCtx, boundary: bool) {
    // boundary:     (?<= W)(?! W) | (?<! W)(?= W)
    // non-boundary: (?<= W)(?= W) | (?<! W)(?! W)
    let (a, b) =
        if boundary { ("!", "=") } else { ("=", "!") };
    write!(
        ctx.out,
        "(?:(?<=[{W}])(?{a}[{W}])|(?<![{W}])(?{b}[{W}]))"
    )
    .unwrap();
}

/// Translate an assertion. Anchors (`^`/`$`) pass through
/// unchanged; Unicode word boundaries (`\b`/`\B`) become
/// lookaround pairs because JS `\b` is ASCII-only.
fn emit_assertion(
    a: &re_ast::Assertion,
    ctx: &mut EmitCtx,
) -> Result<(), Error> {
    use re_ast::AssertionKind::*;
    match a.kind {
        StartLine | StartText => ctx.out.push('^'),
        EndLine | EndText => ctx.out.push('$'),
        WordBoundary => emit_word_boundary(ctx, true),
        NotWordBoundary => emit_word_boundary(ctx, false),
        WordBoundaryStart
        | WordBoundaryEnd
        | WordBoundaryStartAngle
        | WordBoundaryEndAngle
        | WordBoundaryStartHalf
        | WordBoundaryEndHalf => {
            return Err(Error::unsupported(
                "half/special word boundaries \
                 (\\b{start}, \\b{end}, etc.) are not \
                 supported by the JS regex backend",
            ));
        }
    }
    Ok(())
}

/// Emit inline flags (for flag-only groups or non-capturing
/// group prefixes).
///
/// Assumes `validate_ast` has already rejected unsupported flags
/// (CRLF, SwapGreed, IgnoreWhitespace, negated Unicode).
fn emit_flags_inline(
    flags: &re_ast::Flags,
    ctx: &mut EmitCtx,
) {
    for item in &flags.items {
        match &item.kind {
            re_ast::FlagsItemKind::Negation => {
                ctx.out.push('-');
            }
            re_ast::FlagsItemKind::Flag(f) => {
                let ch = match f {
                    re_ast::Flag::CaseInsensitive => 'i',
                    re_ast::Flag::MultiLine => 'm',
                    re_ast::Flag::DotMatchesNewLine => 's',
                    re_ast::Flag::Unicode => 'u',
                    // Rejected by validate_ast.
                    _ => unreachable!(
                        "unsupported flag should have been \
                         rejected by validate_ast"
                    ),
                };
                ctx.out.push(ch);
            }
        }
    }
}

/// Translate a group. Named captures change from
/// `(?P<name>...)` to `(?<name>...)`, and non-capturing groups
/// with flags use JS modifier-group syntax `(?flags:...)`.
fn emit_group(
    g: &re_ast::Group,
    ctx: &mut EmitCtx,
) -> Result<(), Error> {
    match &g.kind {
        re_ast::GroupKind::CaptureIndex(_) => {
            ctx.out.push('(');
            emit(&g.ast, ctx)?;
            ctx.out.push(')');
        }
        re_ast::GroupKind::CaptureName { name, .. } => {
            ctx.out.push_str("(?<");
            ctx.out.push_str(&name.name);
            ctx.out.push('>');
            emit(&g.ast, ctx)?;
            ctx.out.push(')');
        }
        re_ast::GroupKind::NonCapturing(flags) => {
            // Build the group prefix: plain "(?:" or "(?flags:"
            // for JS modifier-group syntax.  Every FlagsItem
            // variant emits at least one char, so non-empty items
            // always produce output.
            if flags.items.is_empty() {
                ctx.out.push_str("(?:");
            } else {
                ctx.out.push_str("(?");
                emit_flags_inline(flags, ctx);
                ctx.out.push(':');
            }
            emit(&g.ast, ctx)?;
            ctx.out.push(')');
        }
    }
    Ok(())
}

/// Recursively translate an AST node to JS RegExp syntax,
/// dispatching to specialized emitters for each node type.
fn emit(ast: &Ast, ctx: &mut EmitCtx) -> Result<(), Error> {
    match ast {
        Ast::Empty(_) => {}
        Ast::Literal(lit) => {
            emit_literal(lit, ctx);
        }
        Ast::Dot(_) => {
            ctx.out.push('.');
        }
        Ast::Flags(sf) => {
            // Inline flag-only group like (?i) or (?m).
            // JS doesn't support standalone inline flag groups.
            // Top-level flags (at pattern offset 0) are extracted
            // to constructor flags by emit_to_js; any remaining
            // SetFlags here are scoped or non-top-level and must
            // be emitted inline (the JS host will reject if
            // unsupported).
            ctx.out.push_str("(?");
            emit_flags_inline(&sf.flags, ctx);
            ctx.out.push(')');
        }
        Ast::Assertion(a) => {
            emit_assertion(a, ctx)?;
        }
        Ast::ClassPerl(cls) => {
            emit_perl_class(cls, ctx);
        }
        Ast::ClassUnicode(cls) => {
            emit_unicode_class(cls, ctx);
        }
        Ast::ClassBracketed(cls) => {
            emit_bracketed_class(cls, ctx)?;
        }
        Ast::Repetition(rep) => {
            emit_repetition_op(rep, ctx)?;
        }
        Ast::Group(g) => {
            emit_group(g, ctx)?;
        }
        Ast::Alternation(alt) => {
            for (i, branch) in alt.asts.iter().enumerate() {
                if i > 0 {
                    ctx.out.push('|');
                }
                emit(branch, ctx)?;
            }
        }
        Ast::Concat(cat) => {
            for child in &cat.asts {
                emit(child, ctx)?;
            }
        }
    }
    Ok(())
}

// -------------------------------------------------------------------
// AST validation
// -------------------------------------------------------------------

const ERR_ANCHOR_IN_QUANTIFIED: &str = concat!(
    "anchors (^ or $) inside quantified groups or ",
    "alternations are not supported by the JS regex ",
    "backend \u{2014} the JS NFA engine produces different ",
    "match spans from Rust's leftmost-first engine",
);

const ERR_EMPTY_ALTERNATION: &str = concat!(
    "empty alternation branches or quantified empty groups ",
    "are not supported by the JS regex backend \u{2014} the ",
    "JS NFA engine produces different empty-match spans ",
    "from Rust's leftmost-first engine",
);

/// Validate the AST for features that the JS backend cannot
/// support.
///
/// Performs flag, anchor, and empty-alternation checks in a single
/// recursive traversal.
fn validate_ast(ast: &Ast) -> Result<(), Error> {
    match ast {
        Ast::Flags(sf) => check_flag_items(&sf.flags),
        Ast::Group(g) => {
            if let re_ast::GroupKind::NonCapturing(ref flags) =
                g.kind
            {
                check_flag_items(flags)?;
            }
            validate_ast(&g.ast)
        }
        Ast::Repetition(r) => {
            // Check for quantified groups containing anchors.
            check_anchor_in_quantified(&r.ast)?;
            validate_ast(&r.ast)
        }
        Ast::Alternation(alt) => {
            for branch in &alt.asts {
                if is_anchor(branch) {
                    return Err(Error::unsupported(
                        ERR_ANCHOR_IN_QUANTIFIED,
                    ));
                }
                if can_match_empty(branch) {
                    return Err(Error::unsupported(
                        ERR_EMPTY_ALTERNATION,
                    ));
                }
                validate_ast(branch)?;
            }
            Ok(())
        }
        Ast::Concat(cat) => {
            for a in &cat.asts {
                validate_ast(a)?;
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

/// Reject flag combinations that JS RegExp cannot express: CRLF
/// mode, swap-greed, ignore-whitespace, and negated Unicode.
fn check_flag_items(
    flags: &re_ast::Flags,
) -> Result<(), Error> {
    let mut negated = false;
    for item in &flags.items {
        match &item.kind {
            re_ast::FlagsItemKind::Negation => {
                negated = true;
            }
            re_ast::FlagsItemKind::Flag(f) => match f {
                re_ast::Flag::CRLF => {
                    return Err(Error::unsupported(
                        "CRLF mode (R flag) is not supported \
                         by the JS regex backend",
                    ));
                }
                re_ast::Flag::SwapGreed => {
                    return Err(Error::unsupported(
                        "swap-greed mode (U flag) is not \
                         supported by the JS regex backend",
                    ));
                }
                re_ast::Flag::IgnoreWhitespace => {
                    return Err(Error::unsupported(
                        "ignore-whitespace mode (x flag) is \
                         not supported by the JS regex \
                         backend",
                    ));
                }
                re_ast::Flag::Unicode if negated => {
                    return Err(Error::unsupported(
                        "inline Unicode disable (?-u) is not \
                         supported by the JS regex backend",
                    ));
                }
                _ => {}
            },
        }
    }
    Ok(())
}

/// Reject quantified groups like `(^|...)+` where anchors at the
/// group boundary cause divergent match spans between JS and Rust.
fn check_anchor_in_quantified(
    ast: &Ast,
) -> Result<(), Error> {
    if let Ast::Group(g) = ast {
        let children: &[Ast] = match &*g.ast {
            Ast::Concat(cat) => &cat.asts,
            other => std::slice::from_ref(other),
        };
        if let (Some(first), Some(last)) =
            (children.first(), children.last())
            && (is_anchor(first) || is_anchor(last))
        {
            return Err(Error::unsupported(
                ERR_ANCHOR_IN_QUANTIFIED,
            ));
        }
    }
    Ok(())
}

/// Test whether an AST node is a line or text anchor (`^`, `$`,
/// `\A`, `\z`).
fn is_anchor(ast: &Ast) -> bool {
    matches!(
        ast,
        Ast::Assertion(a)
            if matches!(
                a.kind,
                re_ast::AssertionKind::StartLine
                    | re_ast::AssertionKind::EndLine
                    | re_ast::AssertionKind::StartText
                    | re_ast::AssertionKind::EndText
            )
    )
}

/// Conservative check for whether an AST node can match the empty
/// string.  Used to reject alternation branches that would produce
/// divergent match positions between JS and Rust engines.
fn can_match_empty(ast: &Ast) -> bool {
    match ast {
        Ast::Empty(_) | Ast::Flags(_) | Ast::Assertion(_) => {
            true
        }
        Ast::Literal(_)
        | Ast::Dot(_)
        | Ast::ClassUnicode(_)
        | Ast::ClassPerl(_)
        | Ast::ClassBracketed(_) => false,
        Ast::Repetition(r) => {
            let min = match &r.op.kind {
                re_ast::RepetitionKind::ZeroOrOne
                | re_ast::RepetitionKind::ZeroOrMore => 0,
                re_ast::RepetitionKind::OneOrMore => 1,
                re_ast::RepetitionKind::Range(range) => {
                    match range {
                        re_ast::RepetitionRange::Exactly(n)
                        | re_ast::RepetitionRange::AtLeast(n)
                        | re_ast::RepetitionRange::Bounded(
                            n, _,
                        ) => *n,
                    }
                }
            };
            if min == 0 {
                true
            } else {
                can_match_empty(&r.ast)
            }
        }
        Ast::Group(g) => can_match_empty(&g.ast),
        Ast::Alternation(alt) => {
            alt.asts.iter().any(can_match_empty)
        }
        Ast::Concat(cat) => {
            cat.asts.iter().all(can_match_empty)
        }
    }
}
