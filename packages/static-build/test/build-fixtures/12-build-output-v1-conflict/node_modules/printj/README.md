# printj

Extended `sprintf` implementation (for the browser and nodejs).  Emphasis on
compliance, performance and IE6+ support.

```js
PRINTJ.sprintf("Hello %s!", "World");
```

A self-contained specification of the printf format string is included below in [this README](#printf-format-string-specification), as well as a summary of the
[support against various printf implementations](#support-summary)


## Installation

With [npm](https://www.npmjs.org/package/printj):

```bash
$ npm install printj
```

In the browser:

```html
<script src="printj.js"></script>
```

The browser exposes a variable `PRINTJ`

When installed globally, npm installs a script `printj` that renders the format
string with the given arguments.  Running the script with `-h` displays help.

The script will manipulate `module.exports` if available (e.g. in a CommonJS
`require` context).  This is not always desirable.  To prevent the behavior,
define `DO_NOT_EXPORT_PRINTJ`

## Usage

In all cases, the relevant function takes a format and arguments to be rendered.

The return value is a JS string.

- `PRINTJ.sprintf(format, ...args)` assumes the arguments are passed directly

- `PRINTJ.vsprintf(format, argv)` assumes the arguments are passed in an array

For example:

```js
> // var PRINTJ = require('printj');       // uncomment this line if in node
> var sprintf = PRINTJ.sprintf, vsprintf = PRINTJ.vsprintf;
> sprintf("Hello %s", "SheetJS")           // 'Hello SheetJS'
> sprintf("%d + %d = %d", 2,3,2+3)         // '2 + 3 = 5'
> vsprintf("%d + %d = %d", [2,3,5])        // '2 + 3 = 5'
> sprintf("%1$02hhx %1$u %1$i %1$o", -69)  // 'bb 4294967227 -69 37777777673'
```

The command line script takes a format and arguments:

```
usage: printj [options] <format> [args...]

Options:
    -h, --help      output usage information
    -d, --dump      print debug information about format string

Arguments are treated as strings unless prefaced by a type indicator:
    n:<integer>     call parseInt (ex. n:3 -> 3)
    f:<float>       call parseFloat (ex. f:3.1 -> 3.1)
    b:<boolean>     false when lowercase value is "FALSE" or "0", else true
    s:<string>      interpret as string (ex. s:n:3 -> "n:3")
    j:<JSON>        interpret as an object using JSON.parse
    e:<JS>          evaluate argument (ex. e:1+1 -> 2, e:"1"+1 -> "11")

samples:
    $ printj '|%02hhx%d|' n:50 e:0x7B                # |32123|
    $ printj '|%2$d + %3$d is %1$d|' e:1+2 n:1 n:2   # |1 + 2 is 3|
    $ printj '|%s is %s|' s:1+2 e:1+2                # |1+2 is 3|
    $ printj '|%c %c|' s:69 n:69                     # |6 E|
```

## Testing

`make test` will run the nodejs-based test.

`make stress` will run a larger test encompassing every possible conversion.  It
requires access to a C compiler.

## License

Please consult the attached LICENSE file for details.  All rights not explicitly
granted by the Apache 2.0 license are reserved by the Original Author.

## Badges

[![Build Status](https://saucelabs.com/browser-matrix/printj.svg)](https://saucelabs.com/u/printj)

[![Build Status](https://travis-ci.org/SheetJS/printj.svg?branch=master)](https://travis-ci.org/SheetJS/printj)

[![Coverage Status](http://img.shields.io/coveralls/SheetJS/printj/master.svg)](https://coveralls.io/r/SheetJS/printj?branch=master)

[![NPM Downloads](https://img.shields.io/npm/dt/printj.svg)](https://npmjs.org/package/printj)

[![Dependencies Status](https://david-dm.org/sheetjs/printj/status.svg)](https://david-dm.org/sheetjs/printj)

[![ghit.me](https://ghit.me/badge.svg?repo=sheetjs/printj)](https://ghit.me/repo/sheetjs/printj)

[![Analytics](https://ga-beacon.appspot.com/UA-36810333-1/SheetJS/printj?pixel)](https://github.com/SheetJS/printj)

# printf format string specification

The `printf` family of functions attempt to generate and output a string of
characters from a series of arguments, following a user-supplied "format string"
specification.  The format string contains normal characters that are written to
the output string as well as specifiers that describe which parameter to insert
and how to render the parameter.  This specification describes how a conformant
implementation should process the format string and generate an output string.
Any discrepancies between this document and the reference implementation are
considered bugs in the implementation.

### Original C Interface

Every function in the `printf` family follows the same logic to generate strings
but have different interfaces reflecting different input and output behaviors.
Some functions have wide variants that use wide `wchar_t *` strings rather than
normal C `char *`.  The following variants are required by the POSIX spec:

|  function  | max length |  output destination   | vintage |  wide ver  |
|------------|------------|-----------------------|---------|------------|
| `printf`   | unbounded  | standard output       | K&R     | `wprintf`  |
| `fprintf`  | unbounded  | stream (`FILE *`)     | K&R     | `fwprintf` |
| `sprintf`  | unbounded  | string (`char *`)     | K&R     | `swprintf` |
| `snprintf` | parameter  | string (`char *`)     | C99     |            |
| `dprintf`  | unbounded  | POSIX file descriptor | POSIX   |            |

Each function has a dual function, whose name begins with `v`, that accepts the
parameters as a `va_list` rather than formal parameters.  In all cases, they
return the number of characters written or a negative value to indicate error:

```C
int   sprintf(char *ostr, const char *fmt, ...);
int  vsprintf(char *ostr, const char *fmt, va_list arg_list);

int  swprintf(wchar_t *ostr, const wchar_t *fmt, ...);
int vswprintf(wchar_t *ostr, const wchar_t *fmt, va_list arg_list);
```

### JS and C strings

C "strings" are really just arrays of numbers.  An external code page (such as
ASCII) maps those numbers to characters.  K&R defines two types of strings:
basic character set strings (`char *`) and extended character set strings
(`wchar_t *`). In contrast, JS has a true string value type.

Unlike in C, JS strings do not treat the null character as an end-of-string
marker.  As a result, characters beyond the first null character will be used.

The JS equivalent of a C extended string would be an array of the individual
character codes.  The C basic string equivalent would involve specifying a code
page and mapping back.  The `codepage` JS library supports common codepages.

While capturing the essence of C strings, using arrays of character codes is not
idiomatic JS.  Few developers leverage this and the downsides far exceed the
benefits of a more direct translation.  The effect can be feigned, as shown in
the `js2c` code sample at the end of the document.

### JS Interface

In the absence of a standard output or even a standard concept of a stream, the
non-string outputs are irrelevant.  Similarly there is no JS analogue of wide
characters.  While useful, lack of direct memory management obviates `snprintf`.
This implementation exports the remaining functions, `sprintf` and `vsprintf`.

Instead of replicating the original C signature and `errno`, functions directly
return the output string and throw Errors:

```typescript
function  sprintf(fmt:string, ...args):string;
function vsprintf(fmt:string, args:Array<any>):string;
```

The C functions return the number of characters written to the string, which is
directly accessible in JS via the `length` property.  A direct replica of the
various string functions are included at the end of the document.

## Specifier heritage and regular expression

Note: The regular expressions follow perl `/x` style.  Whitespace characters
outside of character classes are ignored.  `#` is a comment character and every
character until the end of the line is ignored.  To convert to a standard regex:

```js
regex_string.replace(/#.*$/gm,"").replace(/^\s*/gm,"").replace(/\s*\n/gm,"");
```

Based on K&R, conversions originally followed the format:

 - required: leading `%`
 - optional: `-` (POSIX refers to this as the "flags")
 - optional: positive number or `*` (POSIX "width")
 - optional: period followed by positive number or `*` (POSIX "precision")
 - optional: an `h` or `l` to indicate size of data (POSIX "length")
 - required: character describing output behavior (POSIX "conversion specifier")

This is captured by the regular expression:

```perl
/%(?:
    ([-])?                             # flags (only minus sign)
    (\d+|\*)?                          # width
    (?:\.(\d+|\*))?                    # period + precision
    ([hl])?                            # length
    ([dioxXucsfeEgGp%])                # conversion specifier
)/x
```

Various implementations of `printf` have added different functionality.

ANSI standards up through C99:

 - more flags `"+"` `" "` `"0"` `"#"`
 - more lengths `"L"` `"hh"` `"ll"` `"j"` `"z"` `"t"`
 - more conversions `"F"` `"a"` `"A"` `"n"`

The POSIX specification of `printf` added:

 - positional parameters to identify argument indices
 - more flags `"'"`
 - more conversions `"C"` `"S"`
 - clarifications regarding corner cases and "undefined behavior"

BSD implementations added:

 - more lengths `"q"`
 - more conversions `"D"` `"U"` `"O"`

glibc (GNU) added:

 - more lengths `"Z"`
 - more conversions `"m"`

Windows C Runtime (CRT) added:

 - more lengths `"I"` `"I32"` `"I64"` `"w"`

glibc and CRT both added `Z`. glibc uses `Z` for the length `size_t`. CRT uses
`Z` as a conversion for length-prefixed strings.  This implementation takes the
former approach, handling `Z` in the same way as `z`.

BSD and IBM C library both added `D`.  BSD uses `D` as a conversion, namely as
an alias of `ld`.  IBM uses `D` for the length for `_Decimal64`, a decimal
floating point type, in accordance with ISO/IEC TR 24732.  This implementation
takes the former approach.

This implementation also adds new conversions:

 - `"b"` and `"B"` for binary (base-2) integer renderings
 - `"y"` and `"Y"` for true/false and yes/no Boolean conversions
 - `"J"` for JSON
 - `"T"` and `"V"` for JS typeof and valueOf inspection

Combining the various extensions yields the following regular expression:

```perl
/%(?:
    %|                                  # literal %% (flags etc prohibited)
    ([1-9]\d*\$)?                       # positional parameter
    ([-+ 0\x23\x27]*)?                  # flags
    ([1-9]\d*|\*(?:[1-9]\d*\$)?)?       # width
    (?:\.(\d+|\*(?:[1-9]\d*\$)?))?      # precision
    (hh?|ll?|[LzjtqZIw])?               # length
    ([diouxXfFeEgGaAcCsSpnDUOmbByYJVT]) # conversion specifier
)/x
```
This implementation explicitly does not support certain non-standard extensions:

 - AltiVec vector length extensions (`v` with `h`/`l`/`ll`):
 - CRT fixed width lengths `I32` and `I64`

## Conversion Specifier Quick Reference Table

|  C  |   Type   | Summary                                                     |
|-----|:--------:|-------------------------------------------------------------|
| `a` | floating | base-2 exp form w/ hex mantissa and dec exponent, lowercase |
| `A` | floating | base-2 exp form w/ hex mantissa and dec exponent, uppercase |
| `b` | extended | cast to C `unsigned int`,   standard form binary            |
| `B` | extended | cast to C `unsigned long`,  standard form binary            |
| `c` |   text   | print `latin-1` char from number OR first char of string    |
| `C` |   text   | print `UCS-2`   char from number OR first char of string    |
| `d` | integral | cast to C `int`,   standard form decimal                    |
| `D` | integral | cast to C `long`,  standard form decimal                    |
| `e` | floating | base-10 exp form w/dec mantissa and dec exponent, lowercase |
| `E` | floating | base-10 exp form w/dec mantissa and dec exponent, uppercase |
| `f` | floating | base-10 decimal form, lowercase extended values             |
| `F` | floating | base-10 decimal form, uppercase extended values             |
| `g` | floating | print using `e` or `f` conversion based on value/precision  |
| `G` | floating | print using `E` or `F` conversion based on value/precision  |
| `i` | integral | cast to C `int`,   standard form decimal (alias of `d`)     |
| `J` | extended | prints objects using JSON or `util.inspect`                 |
| `m` |   misc   | prints info about Error objects (JS equivalent of `errno`)  |
| `n` |   misc   | do not print! stores number of chars written to arg `.len`  |
| `o` | integral | cast to C `unsigned int`,   standard form octal             |
| `O` | integral | cast to C `unsigned long`,  standard form octal             |
| `p` |   misc   | print `"l"` field of object (fake pointer)                  |
| `s` |   text   | print string argument                                       |
| `S` |   text   | print string argument (alias of `"s"`)                      |
| `T` | extended | print type information (`typeof` or `Object toString`)      |
| `u` | integral | cast to C `unsigned int`,   standard form decimal           |
| `U` | integral | cast to C `unsigned long`,  standard form decimal           |
| `V` | extended | print primitive value (`valueOf`)                           |
| `x` | integral | cast to C `unsigned int`,   standard form hex, lowercase    |
| `X` | integral | cast to C `unsigned long`,  standard form hex, uppercase    |
| `y` | extended | prints `true`/`false` or `yes`/`no` based on Boolean value  |
| `Y` | extended | prints `TRUE`/`FALSE` or `YES`/`NO` based on Boolean value  |
| `%` |   misc   | print the literal `%` character                             |

## Parameter Selection

The default behavior is to consume arguments in order:

```C
printf("Count to 3: %d %d %d", 1, 2, 3); // Count to 3: 1 2 3
```

POSIX `printf` permits explicit argument selection, bypassing the standard
behavior of using the arguments in order.  To select the `n`-th argument, use
`n$` immediately after the `%` token to select an argument for the conversion:

```C
printf("%d %d %d",       1, 2, 3);        // 1 2 3 (implicit order 1, 2, 3 )
printf("%1$s %2$s %3$s", "a", "b", "c");  // a b c (explicit order 1, 2, 3 )
printf("%1$s %3$s %2$s", "a", "b", "c");  // a c b (explicit order 1, 3, 2 )
```

The POSIX standard asserts that mixing positional and non-positional conversions
is undefined behavior.  This implementation handles mixing by tracking the index
for non-positional conversions:

```C
printf("%s %4$s %s %5$s %s", "a", "b", "c", "d", "e"); // a d b e c
```

The POSIX standard requires that if an argument is used in the format, every
preceding argument must be used.  This implementation relaxes that requirement:

```C
printf("%3$s", "a", "b", "c"); // c (technically invalid since "a"/"b" unused)
```

## Dynamic Specifiers

The width and precision specifiers may include the dynamic specifier `*` which
instructs the engine to read the next argument (assumed to be an integer).  Just
as with the positional parameter, `idx$` immediately after the `*` token selects
the numeric argument.

For example:

```C
printf("|%5s|", "sheetjs");               // |sheetjs|    (width = 5)
printf("|%*s|", 5, "sheetjs");            // |sheetjs|    (width first argument)
printf("|%2$*1$s|", 5, "sheetjs", 10);    // |sheetjs|    (width is argument #1)

printf("|%10s|", "sheetjs");              // |   sheetjs| (width = 10)
printf("|%2$*3$s|", 5, "sheetjs", 10);    // |   sheetjs| (width is argument #3)
```

Arguments are generally consumed in order as presented in the format string:

```C
printf("|%s|", val);
printf("|%*s|", width, val);
printf("|%.*s|", prec, val);
printf("|%*.*s|", width, prec, val);
printf("|%0*.*d|", 4, 2, 1);  // |  01| width=4 prec=2 value=1
```

Positional arguments can be applied to width and precision:

```C
printf("|%*.*d|", width, prec, val);
printf("|%2$0*3$.*1$d|", prec, val, width);
printf("|%0*.*d|", 4, 2, 1);        // |  01| width=4 prec=2 value=1 flags='0'
printf("|%1$0*3$.*2$d|", 1, 2, 4);  // |  01| width=4 prec=2 value=1 flags='0'
```

A negative width is interpreted as the `-` flag with a positive width:

```C
printf("|%*.*d|",   4, 2, 1);        // |  01| width=4 prec=2 value=1 flags=''
printf("|%-*.*d|",  4, 2, 1);        // |01  | width=4 prec=2 value=1 flags='-'
printf("|%*.*d|",  -4, 2, 1);        // |01  | width=4 prec=2 value=1 flags='-'
printf("|%-*.*d|", -4, 2, 1);        // |01  | width=4 prec=2 value=1 flags='-'
```

A negative precision is discarded:

```C
printf("|%*s|", 4, "sheetjs");       // |sheetjs|  width=4
printf("|%*.*s|", 4,  3, "sheetjs"); // | she|     width=4 prec=3
printf("|%*.*s|", 4,  2, "sheetjs"); // |  sh|     width=4 prec=2
printf("|%*.*s|", 4,  1, "sheetjs"); // |   s|     width=4 prec=1
printf("|%*.*s|", 4,  0, "sheetjs"); // |    |     width=4 prec=0
printf("|%*.*s|", 4, -1, "sheetjs"); // |sheetjs|  width=4 (prec ignored)
```


# C Data Model

JS has one numeric type `Number` which represents an IEEE754 double-precision
(64-bit) floating point number.  C has a multitude of numeric types, including
floating point as well as integer types.  The sizes of those data types are
implementation-dependent.  A "C data model" specifies the sizes of the core C
data types.

### Integer Types

POSIX `printf` specification references 8 integer types in integer conversions:

| C data type |  fmt  | unsigned type        |  fmt  | signed type   |  fmt  |
|-------------|------:|----------------------|------:|---------------|------:|
| `char`      |       | `unsigned char`      | `hhu` | `signed char` | `hhd` |
| `short`     |  `hd` | `unsigned short`     |  `hu` |               |       |
| `int`       |   `d` | `unsigned int`       |   `u` |               |       |
| `long`      |  `ld` | `unsigned long`      |  `lu` |               |       |
| `long long` | `lld` | `unsigned long long` | `llu` |               |       |
| `size_t`    |  `zu` |                      |       | `ssize_t`     |  `zd` |
| `intmax_t`  |  `jd` | `uintmax_t`          |  `ju` |               |       |
| `ptrdiff_t` |  `td` |                      |       |               |       |

C99 does not officially define a signed `size_t` or unsigned `ptrdiff_t` type.
POSIX does define `ssize_t` but no equivalent `uptrdiff_t`.

BSD additionally recognizes the types `quad_t` and `u_quad_t`, which this
implementation treats as `long long int` and `unsigned long long int`.

### Character and String Types

Two integer types are used in character and string conversions:

| type        |  fmt  |
|-------------|------:|
| `wchar_t`   |  `ls` |
| `wint_t`    |  `lc` |

Both wide types `wchar_t` and `wint_t` can be signed or unsigned according to
C99.  Both types are used only in character and string conversions.  Based on
K&R "printable characters are always positive", the types are assumed unsigned.

### Floating Point Number Types

K&R recognizes 3 floating point types.  C99 later tied it to IEC 60559:

|  C data type  | precision | total bits | exponent | mantissa |  fmt  |
|:--------------|:----------|:----------:|:--------:|:--------:|------:|
| `float`       | single    |    `32`    |    `8`   |   `23`   |       |
| `double`      | double    |    `64`    |   `11`   |   `52`   |   `f` |
| `long double` | extended  |    `80`    |   `15`   |   `64`   |  `Lf` |

## Implementation

Numerous "C data models", specifying the bit/byte sizes of the various types,
have been and continue to be used.  For example, OSX and other modern 64-bit
UNIX flavors use the "LP64" C data model.  64-bit Windows currently uses the
"LLP64" model.  32-bit systems generally use the "ILP32" model.  The 8-bit byte
sizes for the various types under the various models are defined in ctypes.json
in the `Models` object as per the following table:

| type        | ctypes.json | LP64 | ILP32 | LLP64 |
|-------------|-------------|-----:|------:|------:|
| `char`      | `char`      |   1  |    1  |    1  |
| `short`     | `short`     |   2  |    2  |    2  |
| `int`       | `int`       |   4  |    4  |    4  |
| `long`      | `long`      |   8  |    4  |    4  |
| `long long` | `longlong`  |   8  |    8  |    8  |
| `wchar_t`   | `wchar_t`   |   4  |    4  |    2  |
| `wint_t`    | `wint_t`    |   4  |    4  |    2  |
| `size_t`    | `size_t`    |   8  |    4  |    8  |
| `intmax_t`  | `intmax_t`  |   8  |    8  |    8  |
| `ptrdiff_t` | `ptrdiff_t` |   8  |    4  |    8  |

By default the source assumes the LP64 data model.  Other data models are
supported in the source tree, controlled by the JSFLAGS variable in the build
process.  Set the `JS_MODEL` variable to the desired index as specified in the
`ModelNames` array in `bits/ctype.json`:

```bash
$ <bits/ctypes.json jq -r '.ModelNames|.[]'  # LP64 ILP32 LLP64
$ JSFLAGS=-DJS_MODEL=0 make                  # LP64
$ JSFLAGS=-DJS_MODEL=1 make                  # ILP32
$ JSFLAGS=-DJS_MODEL=2 make                  # LLP64
```

To create a custom model, add the spec to `bits/ctypes.json` by appending the
model name to the end of the `ModelNames` array and adding an entry to the
`Models` object.  The current models are defined as follows:

```json
{
  "ModelNames":["LP64", "ILP32", "LLP64"],
  "Models": {
    "LP64":  { "char":1, "short":2, "int":4, "long":8, "longlong":8, "wint_t":4, "wchar_t":4, "size_t":8, "intmax_t":8, "ptrdiff_t":8 },
    "ILP32": { "char":1, "short":2, "int":4, "long":4, "longlong":8, "wint_t":4, "wchar_t":4, "size_t":4, "intmax_t":8, "ptrdiff_t":4 },
    "LLP64": { "char":1, "short":2, "int":4, "long":4, "longlong":8, "wint_t":2, "wchar_t":2, "size_t":8, "intmax_t":8, "ptrdiff_t":8 }
  }
}
```

# Integer Conversions

This section covers the conversions `diouxXDUO`.  The base-2 conversions `bB`
are an extension and are discussed at the end, but the same basic rules apply.

JS has one Number type (representing an IEEE754 8-byte floating point number)
that is capable of representing a 32-bit integer.  It cannot represent the full
range of 64-bit integers exactly.  Care is taken to avoid operations that may
inadvertently result in a conversion to a smaller integral type.

## Restricting Integer Values

JS Bitwise operations convert numbers to 32-bit integers before performing
operations.  With the exception of the unsigned right shift operator `>>>`, all
operations act on signed integers.  For example:

```js
Math.pow(2,31) | 0;        // -2147483648 == -Math.pow(2,31)
(Math.pow(2,32)-2) ^ 0;    // -2
-1 >>> 0                   // 4294967295 == Math.pow(2,32) - 1
```

JS Number can exactly represent every integer in the range `-2^53 .. 2^53`.  For
lengths exceeding 32 bits, `Math.round` is appropriate.

| bits | unsigned                  | signed                                    |
|------|---------------------------|-------------------------------------------|
| 8    | `V & 0xFF`                | `V &= 0xFF; if(V > 0x7F) V-= 0x100`       |
| 16   | `V & 0xFFFF`              | `V &= 0xFFFF; if(V > 0x7FFF) V-= 0x10000` |
| 32   | `V >>> 0`                 | `V | 0`                                   |
| 64   | `Math.abs(Math.round(V))` | `Math.round(V)`                           |

## Length Specifiers for Integer Conversions

When a length specifier implies a certain size (such as `hh` for a single-byte
integer), the number will be converted before rendering strings.  For example:

```C
printf("%1$02hhx %1$02hx %1$02lx %1$02llx", 256);       // |00 100 100 100|
printf("%1$02hhx %1$02hx %1$02lx %1$02llx", 4096);      // |00 1000 1000 1000|
printf("%1$02hhx %1$02hx %1$02lx %1$02llx", 65536);     // |00 00 10000 10000|
```

Values are restricted by first limiting the result to a specified number of
bytes (appropriate bit-and) and then adding or subtracting to ensure the value
is signed or unsigned according to the conversion specifier.  If a length is
specified, it overrides the implied length of the conversion.  The following
table describes the behavior of this implementation:

| implied C type                      | ctypes.json | length | conv default |
|:------------------------------------|:------------|:------:|:-------------|
| `int` or `unsigned int`             | `int`       | (none) | d i o u x X  |
| `char` or `unsigned char`           | `char`      |   hh   |
| `short` or `unsigned short`         | `short`     |    h   |
| `long` or `unsigned long`           | `long`      |    l   | D U O        |
| `long long` or `unsigned long long` | `longlong`  | L ll q |
| `intmax_t` or `uintmax_t`           | `intmax_t`  |    j   |
| `size_t` or `ssize_t`               | `size_t`    |   z Z  |
| `ptrdiff_t` or unsigned variant     | `ptrdiff_t` |    t   |

## Rendering Unsigned Integers in Base 10 ("u" and "U" conversions)

`num.toString(10)` produces the correct result for exact integers.

`"u"` conversion restricts values to `int`; `"U"` restricts to `long`.

## Rendering Unsigned Integers in Base 8 ("o" and "O" conversions)

Even though `num.toString(8)` is implementation-dependent, all browser
implementations use standard form for integers in the exact range.

The alternate form (`#`) prints a `"0"` prefix.

`"o"` conversion restricts values to `int`; `"O"` restricts to `long`.

## Rendering Unsigned Integers in Base 16 ("x" and "X" conversions)

Even though `num.toString(16)` is implementation-dependent, all browser
implementations use standard form for integers in the exact range.

The alternate form (`#`) prints a `"0x"` or `"0X"` prefix.

Unlike `"U" "O" "D"`, `"X"` conversion uses `A-F` instead of `a-f` in hex.

## Rendering Signed Integers in Base 10 ("d" "i" and "D" conversions)

`num.toString(10)` produces the correct result for exact integers.  The flags
`" +"` control prefixes for positive integers.

`"di"` conversions restrict values to `int`; `"D"` restricts to `long`.


# Floating Point Conversions

This section covers the conversions `fFeEgGaA`.

Due to C variadic argument promotion rules, `float` types are always promoted to
`double`.  None of the conversions or length specifiers signal that an argument
is to be interpreted as a `float`.  There is no JS canonical representation of
an extended floating point number, so JS `Number` suffices.

## Infinity, NaN, and Negative Zero

JS recognizes a few special IEEE754 values, as described in the following table:

|   JS value  | JS Expression | Description                                    |
|------------:|:--------------|:-----------------------------------------------|
|  `Infinity` | `1./0.`       | Positive limiting value `lim{x->0+} 1/x`       |
| `-Infinity` | `-1./0.`      | Negative limiting value `lim{x->0+} -1/x`      |
|       `NaN` | `0./0.`       | Placeholder for "not-a-number" e.g. `0./0.`    |
|       `-0.` | `-1/Infinity` | Negative limiting value `lim{x->0-} x`         |

JS `Number` methods render different strings from the POSIX spec:

|   JS value  | POSIX string                                  | JS string     |
|------------:|:----------------------------------------------|--------------:|
|  `Infinity` |  `"inf"  "INF"` or  `"infinity"  "INFINITY"`  |  `"Infinity"` |
| `-Infinity` | `"-inf" "-INF"` or `"-infinity" "-INFINITY"`  | `"-Infinity"` |
|       `NaN` | `"[-]nan" "[-]NAN"` w/opt parenthesized chars |       `"NaN"` |
|       `-0.` | uses negative sign (e.g. `"-0"` under `"%f"`) | same as `+0.` |

This implementation performs the required adjustments.

## Exponential Form ("e" and "E" conversions)

Aside from the special cases discussed above, JS `num.toExponential(prec)`
differs from POSIX `printf("%1$.*2$e", num, prec)` in the exponent field: JS
writes exponents with the fewest digits (POSIX requires 2+ digits).  This is
easily fixed by inspecting the output string and inserting a "0" when needed.

The optional `#` flag forces the decimal point to appear when precision is 0.
This is also easily corrected by adding a decimal point just before the "e".

## Standard Form ("f" and "F" conversions)

The POSIX spec only requires that the number of digits after the decimal point
is equal to the precision.  It does not specify how many digits appear before
the decimal point, nor does it specify how to handle numbers that cannot be
exactly represented.

For values less than `1e21` the JS `num.toFixed(n)` generally matches `%f` with
the specified precision.  However, for larger values `toFixed` defaults to the
exponential form.

## Value-dependent Form ("g" and "G" conversions)

The final form (exponential or standard) is determined based on the value.  The
threshold is different from the JS `toString` / `toPrecision` thresholds and
depends on the specified precision as well as the base-10 exponent:

|   Value   |  `"%.3g"`  | `toPrecision(3)` |
|----------:|:-----------|:-----------------|
| 1.2345e-4 | `0.000123` | `0.000123`       |
| 1.2345e-5 | `1.23e-05` | `0.0000123`      |
| 1.2345e-6 | `1.23e-06` | `0.00000123`     |
| 1.2345e-7 | `1.23e-07` | `1.23e-7`        |

According to JS spec, `toPrecision` uses standard form when `precision > E` and
`E >= -6`.  For printf standard form is used when `precision > E` and `E >= -4`.

## Hex-Mantissa Decimal-Binary-Exponent Form ("a" and "A" conversions)

A general exponential form involves 3 parameters: radix of the mantissa, base of
the exponent expression, and radix of the exponent expression.  The standard
exponential form uses decimal for all three parts.  For base 16, there are quite
a few reasonable combinations.  Consider the value `1.234567e-80`:

| Mant | Exp Base | Radix-10 (sigil `";"`) | Radix-16 (sigil `";"`) |
|:----:|:--------:|:-----------------------|:-----------------------|
|  10  |    10    | `1.234567;-80`         | `1.234567;-50`         |
|  16  |    10    | `1.3c0c9539b8887;-80`  | `1.3c0c9539b8887;-50`  |
|  16  |    16    | `5.daf8c8f5f4104;-67`  | `5.daf8c8f5f4104;-43`  |
|  16  |     4    | `1.76be323d7d041;-133` | `1.76be323d7d041;-85`  |
|  16  |     2    | `1.76be323d7d041;-266` | `1.76be323d7d041;-10a` |

POSIX `"%a"` uses a hex mantissa (16), decimal exponent radix (10), and binary
exponent base (2).  The general normalized form requires that the integral part
of the mantissa to exceed 0 and not to exceed `exponent base - 1` except in the
special case of `0`.  The sigil is `p` and exponent sign is always used.

JS `num.toString(radix)` is implementation-dependent for valid non-10 radices
(`2-9, 11-36`).  IE uses hex-mantissa decimal-hex-exponent form when the
absolute value of the base-2 exponent exceeds 60.  Otherwise, IE uses an exact
standard hexadecimal form.  Chrome, Safari and other browsers always use the
exact standard hexadecimal form.  Both forms are easily converted to `"%a"` by
calculating and dividing by the appropriate power of 2.

For each non-zero normal floating point value, there are 4 acceptable strings
that represent the value, derived by multiplying the normalized value by powers
of 2 and adjusting the exponent accordingly:

| Value   | Normalized     | Alternate `*2` | Alternate `*4` | Alternate `*8` |
|:--------|:---------------|:---------------|:---------------|:---------------|
| `1`     | `1p+0`         | `2p-1`         | `4p-2`         | `8p-3`         |
| `.2`    | `1.9999999p-3` | `3.3333333p-4` | `6.6666666p-5` | `c.cccccccp-6` |
| `.69`   | `1.6147ae1p-1` | `2.c28f5c2p-2` | `5.851eb85p-3` | `b.0a3d70ap-4` |
| `6.e20` | `1.043561p+69` | `2.086ac3p+68` | `4.10d586p+67` | `8.21ab0dp+66` |

JS engines follow the glibc model: multiply by a suitable power of 16 so that
the mantissa is between 1 and 16, render left to right one digit at a time, then
fix the result at the end.  FreeBSD and OSX always show the normalized form.
This implementation defaults to the normalized form.  To switch to the glibc
form, define `DO_NOT_NORMALIZE` in the `JSFLAGS` variable when building:

```bash
$ JSFLAGS=-DDO_NOT_NORMALIZE make
```

# Character Conversions

This section covers the conversions `sScC`.

## Rendering Strings ("s" and "S" conversions)

JS has no concept of "wide strings" (`wchar_t *` in C), so the length modifiers
are ignored.  `s` and `S` are treated as equivalent.

Arguments are first interpreted as strings by calling the `String` function.
Implementing `toString` on the argument to be converted may lead to unexpected
results:

```C
var O = {valueOf:function() {return 456;}, toString:function() {return "123"}};
printf("%1$s %1$d", O); // "123 456"
```

If a positive precision is specified, up to that many characters will be taken
from the string.  Otherwise the entire string will be used:

```C
printf("|%s|", "sheetjs");    // '|sheetjs|' (no precision)
printf("|%.9s|", "sheetjs");  // '|sheetjs|' (string shorter than precision)
printf("|%.5s|", "sheetjs");  // '|sheet|'   (string truncated)
```

Lengths are measured using the JS string length accessor.  Since there is no
attempt to correct for multi-character sequences like combining marks, the
results may be unexpected:

```C
printf("%.1s","ñ");  // 'n' not "ñ"
```

If the width is specified and is greater than the width of the string to be
rendered, padding will be applied.  If the `"-"` flag is specified, then the
string will be right-padded, otherwise it will be left-padded.  If the `"0"`
flag is specified, the final string is left-padded with zeroes. The `"-"` flag
takes precedence over `0`.

```C
printf(   "|%s|", "sheetjs");   // '|sheetjs|'   (no width)
printf(  "|%5s|", "sheetjs");   // '|sheetjs|'   (string longer than width)
printf(  "|%9s|", "sheetjs");   // '|  sheetjs|' (no flag = left pad spaces)
printf( "|%09s|", "sheetjs");   // '|00sheetjs|' ("0" = left pad "0")
printf( "|%-9s|", "sheetjs");   // '|sheetjs  |' ("-" = right pad space)
printf("|%-09s|", "sheetjs");   // '|sheetjs  |' ("0" ignored)
```

## Rendering Characters ("c" and "C" conversions)

JS has no concept of "wide characters" (`wchar_t` in C).  The length modifier is
used in determining whether the number should be interpreted as one or two
16-bit character codes (when the "C" format or the "l" or "ll" specifiers are
used) or a single 8-bit char code.  Precision and flags are ignored.

# Non-Numeric Conversions

## The literal "%" symbol ("%" conversion)

All other parameters are ignored.

## Interpreting and Rendering Pointers ("p" conversion)

JS has no true concept of pointers.  In array and typed array contexts, it is
common to associate a position object that stores the address relative to the
start of the array.  This implementation reads the `l` key and interprets as a
32-bit or 52-bit unsigned integer depending on `size_t` in the data model.

The normal output format is equivalent to `"%#x"` but the alternate form emits
using the `"%d"` format.  When the pointer is invalid, `-1` is rendered.  Only
the `"#"` flag is interpreted.

```js
var x = {}, y = {l:3};
printf("%1$p %1$#p", y); // 0x3 3
printf("%1$p %1$#p", x); // 0xFFFFFFFF -1
```

## Extracting length of a partial conversion ("n" conversion)

C `printf` permits a special `n` conversion which interprets the argument as an
integral pointer (interpreted size controlled by the length specifier) and
writes the number of characters printed to that pointer.

JS has no true concept of pointers in the C sense.  The library works around
the limitation by interpreting the argument as an object and assigning to the
`len` key.  The conversion does not write any characters to the output string:

```js
var x = {};
printf("%1$s %2$J%2$n abc", "foo", x); // "foo {} abc", also sets x.len = 6
//     |........|                         |......|  (6 chars at that point)
```

This implementation mutates the object while processing:

```js
var x = {};
printf("%1$s %2$J%2$n %3$s %2$J", "foo", x, "bar"); // 'foo {} bar {"len":6}'
```

## Error messages ("m" conversion)

glibc supports an `m` conversion that does not consume arguments.  It renders
the string `strerror(errno)` where `strerror` is the libc function and `errno`
is the global error number.

JS has no equivalent of `errno` and no standard JS runtime exposes a similar
global error variable, so `%m` will write the default message `"Success"`.  A
positional parameter or `#` flag changes the behavior:

|     form     | position | behavior                              |
|:------------:|:--------:|---------------------------------------|
|     main     |    no    | do not read argument, emit "Success"  |
| alt (flag #) |    no    | read and process next argument        |
| main or alt  |   yes    | read and process specified argument   |

In all forms other than `"%m"`, an argument will be processed as follows:

- If the argument is not an instance of an `Error`, emit "Success"
- If the `message` field is set, emit the error message.
- If the `errno` field is set, emit "Error number " followed by the errno
- Otherwise emit "Error " followed by the error interpreted as a String

```
var x = new Error("sheetjs");
x.errno = 69; x.toString = function() { return "SHEETJS"; };
printf("|%#m|", x);      // |sheetjs|
delete x.message;
printf("|%#m|", x);      // |Error number 69|
delete x.errno;
printf("|%#m|", x);      // |Error SHEETJS|
```

# Extensions

These additional conversions take advantage of unused format characters:

## Rendering Boolean Values ("y" and "Y" conversions)

Values are converted to Boolean and tested for truthiness.  The `Y` rendering
is the uppercase version of the equivalent rendering with format `y`.


|     form     | truthy value  `y` (`Y`) | falsy value `y` (`Y`) |
|:------------:|:-----------------------:|:---------------------:|
|     main     |     `true` (`TRUE`)     |   `false` (`FALSE`)   |
| alt (flag #) |      `yes` (`YES`)      |      `no` (`NO`)      |

Width and precision are applied in the same manner as the `s` conversion.

```js
printf("|%1$y|%2$Y|%1$#Y|%2$#y|%2$.1y|", 1, 0); // |true|FALSE|YES|no|f|
printf("|%05.2Y|%-5.2y|", 1, 0);  // |000TR|fa   |
```

## Rendering JSON ("J" conversion)

The default rendering is the standard output from `JSON.stringify`.  Alternate
form (`"#"` flag) renders using `util.inspect` if available.

```js
var x = {
  a: [1,[2,3,4],5,6,7],
  b: {
    c: {
      d: { e:"f" },
      g:"h",
      i:"j"
    },
    k:"l",
    m:"n",
    o:"p"},
  q: "r"
};
printf("%J", x) // '{"a":[1,[2,3,4],5,6,7],"b":{"c":{"d":{"e":"f"}, ..(ctnd)..
printf("%#J", x) // '{ a: [ 1, [ 2, 3, 4 ], 5, 6, 7 ],\n  b: { c: { ..(ctnd)..
```

Width, precision and other flags are ignored.

## JS typeof and valueOf ("T" and "V" conversion)

Under the "T" conversion, the result of `typeof arg` is rendered.  If the `#`
flag is specified, the type is derived from `Object.prototype.toString`:

```
printf("%1$T %1$#T", 1);          // 'number Number'
printf("%1$T %1$#T", 'foo');      // 'string String'
printf("%1$T %1$#T", [1,2,3]);    // 'object Array'
printf("%1$T %1$#T", null);       // 'object Null'
printf("%1$T %1$#T", undefined);  // 'undefined Undefined'
```

Under the "V" conversion, the result of `arg.valueOf()` is rendered:

```
var _f = function() { return "f"; };
var _3 = function() { return 3; };
printf("%1$d %1$s %1$V", {toString:_f});               // '0 f f'
printf("%1$d %1$s %1$V", {valueOf:_3});                // '3 [object Object] 3'
printf("%1$d %1$s %1$V", {valueOf:_3, toString:_f});   // '3 f 3'
```

## Rendering Unsigned Integers in Base 2 ("b" and "B" conversions)

The implementation is similar to the octal `"o"` and `"O"` conversions, except
for the radix (2 for `"b"` and `"B"`) and the alternate-form prefix (`"0b"`)

# Miscellaneous Notes

## Format Characters

For compatibility purposes, format characters must be printable ASCII characters
(ASCII codes `0x20 - 0x7E`).  The 95 eligible characters are listed below:

|  C  |    Type    |  C  |    Type    |  C  |    Type    |  C  |    Type    |
|-----|:----------:|-----|:----------:|-----|:----------:|-----|:----------:|
| `a` | conversion | `A` | conversion | ` ` |    flag    | `!` |            |
| `b` | conversion | `B` | conversion | `"` |            | `#` |    flag    |
| `c` | conversion | `C` | conversion | `$` |    other   | `%` | conversion |
| `d` | conversion | `D` | conversion | `&` |            | `'` |    flag    |
| `e` | conversion | `E` | conversion | `(` |            | `)` |            |
| `f` | conversion | `F` | conversion | `*` |    other   | `+` |    flag    |
| `g` | conversion | `G` | conversion | `,` |            | `-` |    flag    |
| `h` |   length   | `H` |            | `.` |    other   | `/` |            |
| `i` | conversion | `I` |   length   | `0` |    digit   | `1` |    digit   |
| `j` |   length   | `J` | conversion | `2` |    digit   | `3` |    digit   |
| `k` |            | `K` |            | `4` |    digit   | `5` |    digit   |
| `l` |   length   | `L` |   length   | `6` |    digit   | `7` |    digit   |
| `m` | conversion | `M` |            | `8` |    digit   | `9` |    digit   |
| `n` | conversion | `N` |            | `:` |            | `;` |            |
| `o` | conversion | `O` | conversion | `<` |            | `=` |            |
| `p` | conversion | `P` |            | `>` |            | `?` |            |
| `q` |   length   | `Q` |            | `@` |            | `[` |            |
| `r` |            | `R` |            | `\` |            | `]` |            |
| `s` | conversion | `S` | conversion | `^` |            | `_` |            |
| `t` |   length   | `T` | conversion | `~` |            | `{` |            |
| `u` | conversion | `U` | conversion | `|` |            | `}` |            |
| `v` |            | `V` | conversion | `` ` `` |        |
| `w` |   length   | `W` |            |
| `x` | conversion | `X` | conversion |
| `y` | conversion | `Y` | conversion |
| `z` |   length   | `Z` |   length   |

## JS and C strings

C provides no guidance on the actual character set.  According to K&R all valid
characters in source code must be in a character set that is a subset of the
7-bit ASCII set.  This implementation falls back on the UTF-16 base required by
JS.  When converting C literal strings, there are a few differences in escaping:

| C escape sequence | Equivalent JS | Notes                                  |
|:------------------|:--------------|:---------------------------------------|
| `"\a"`            |  `"\007"`     | BEL character will not ring in browser |
| `"\?"`            |  `"?"`        | JS does not handle trigraphs           |
| `"\ooo"` (octal)  |  `"\ooo"`     | JS uses Latin-1 for non-ASCII codes    |
| `"\xhh"` (hex)    |  `"\xhh"`     | JS uses Latin-1 for non-ASCII codes    |

## Browser Deviations

Opera does not always include the last significant digit in base 16 rendering.
For example, `(-6.9e-11).toString(16)` is `"0.000000004bddc5fd160168"` in every
other browser but is `"0.000000004bddc5fd16017"` in Opera.  The test suite skips
the `%a/%A` precision-less formats in Opera.

`Object.prototype.toString.call` gives unexpected results in older browsers, and
no attempt is made to correct for them.  The test suite ignores those cases:

| value       | `%#T` expected | `%#T` IE < 9 | `%#T` Android < 4.4 |
|:------------|:---------------|:-------------|:--------------------|
| `null`      | `"Null"`       | `"Object"`   | `"global"`          |
| `undefined` | `"Undefined"`  | `"Object"`   | `"global"`          |

## Support Summary

- Full [POSIX](http://pubs.opengroup.org/onlinepubs/9699919799/functions/printf.html) conversion support with extensions!
  [Conversion Specifier Table](#conversion-specifier-quick-reference-table)
- Full support for POSIX flags and positional parameters
- Emulation of BSD `quad_t` and `u_quad_t` conversion
- Parser accepts but does not emulate CRT wide and unicode character conversions
- glibc `Z` length conversion and extended `m` error support
- Parser fails on CRT `I32`/`I64` fixed lengths
- Default `LP64` data model but can be configured to support `ILP32` or `LLP64`

