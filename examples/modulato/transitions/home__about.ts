import { transition, resolveTokens } from 'modulato'
import tokens from './home__about.motion'

/** Home <-> About: a full-screen slide, mirrored on the way back. */
export default transition({
  symmetric: true,
  async run({ from, to }) {
    const { duration, ease } = resolveTokens(tokens).slide
    const sign = to.route.id === 'about' ? -1 : 1
    const options: KeyframeAnimationOptions = { duration, easing: ease, fill: 'forwards' }
    await Promise.all([
      from.element.animate(
        [{ transform: 'translateX(0)' }, { transform: `translateX(${sign * 100}%)` }],
        options,
      ).finished,
      to.element.animate(
        [{ transform: `translateX(${sign * -100}%)` }, { transform: 'translateX(0)' }],
        options,
      ).finished,
    ]).catch(() => {})
  },
})
