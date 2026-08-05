---
'vercel': patch
---

`vercel ship` now measures terminal width the way a terminal does. Text is
segmented into graphemes and each is measured with its east asian width, so a
CJK ideograph or an emoji counts as the two columns it occupies, a combining
mark counts as none, and a multi code point emoji counts once. Measuring by
string length was correct only for ASCII, and every wrong measurement shifted
the text column for the rest of the line.

Runs of wide characters are also broken when they do not fit, since CJK is
written without spaces and would otherwise overflow every line, while a long
ASCII word such as a URL is still left intact.
