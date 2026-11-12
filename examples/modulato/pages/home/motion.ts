import { motion } from 'modulato'

export default motion({
  intro: {
    headline: {
      yPercent: 110,
      duration: 1.1,
      ease: 'expo.out',
      phone: { yPercent: 60, duration: 0.85 },
      reduced: { yPercent: 0, duration: 0 },
    },
    tagline: {
      at: 0.35,
      y: 20,
      duration: 0.8,
      ease: 'expo.out',
      reduced: { y: 0, duration: 0, at: 0 },
    },
  },
})
