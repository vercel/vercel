---
'@vercel/frameworks': patch
---
Serve the Dojo, Parcel, Scully, VuePress, Zola and FastHTML preset logos as SVG
These were the only six presets still pointing at raster logos. `next/image`
skips image optimization for `.svg` sources unless `dangerouslyAllowSVG` is
enabled, so these six were the only preset logos routed through the optimizer in
consumers such as the project settings framework picker, which made them the only
ones that could fail to render. Serving them as vectors puts all presets on the
same direct-load path and cuts the six logos from 373 KB to 33 KB.
