import { motion } from 'modulato'

/** Shell motion tokens — tweak live in the dev overlay (the ✦ motion button). */
export default motion({
  shell: {
    menu: {
      yPercent: -200,
      duration: 0.9,
      ease: 'expo.out',
      reduced: { yPercent: 0, duration: 0 },
    },
  },
})
