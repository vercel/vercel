// When making building your custom storefront, you will most likely want to
// use custom fonts as well. These are often implemented without critical
// performance optimizations.

// Below, you'll find the markup needed to optimally render a pair of web fonts
// that we will use on our journal articles. This typeface, IBM Plex,
// can be found at: https://www.ibm.com/plex/, as well as on
// Google Fonts: https://fonts.google.com/specimen/IBM+Plex+Serif. We included
// these locally since you’ll most likely be using commercially licensed fonts.

// When implementing a custom font, specifying the Unicode range you need,
// and using `font-display: swap` will help you improve your performance.

// For fonts that appear in the critical rendering path, you can speed up
// performance even more by including a <link> tag in your HTML.

// In a production environment, you will likely want to include the below
// markup right in your index.html and index.css files.

import '../styles/custom-font.css';

export function CustomFont() {}
