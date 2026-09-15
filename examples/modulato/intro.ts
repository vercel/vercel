import gsap from 'gsap'
import { intro, resolveTokens } from 'modulato'
import tokens from './motion'

/** Shell intro: first-load choreography for the persistent elements. */
export default intro({
  async run({ element }) {
    const { menu } = resolveTokens(tokens).shell
    await gsap
      .from(element.querySelector('.menu__list'), {
        yPercent: menu.yPercent,
        duration: menu.duration,
        ease: menu.ease,
      })
      .then()
  },
})
