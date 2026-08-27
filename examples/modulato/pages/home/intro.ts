import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { intro, resolveTokens } from 'modulato'
import tokens from './motion'

gsap.registerPlugin(SplitText)

/**
 * First-load intro (runs after fonts are ready; navigations use
 * transitions/ instead). Numbers live in ./motion.ts — tweak them live.
 */
export default intro({
  async run({ element }) {
    const { headline, tagline } = resolveTokens(tokens).intro
    const headlineEl = element.querySelector<HTMLElement>('.home__headline')
    const tl = gsap.timeline()

    let split: SplitText | null = null
    if (headlineEl) {
      split = new SplitText(headlineEl, { type: 'lines', mask: 'lines' })
      tl.from(split.lines, { yPercent: headline.yPercent, duration: headline.duration, ease: headline.ease }, 0)
    }
    tl.from(element.querySelector('.home__tagline'),
      { y: tagline.y, opacity: 0, duration: tagline.duration, ease: tagline.ease }, tagline.at)

    await tl.then()
    split?.revert()
  },
})
