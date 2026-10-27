import { motion } from 'modulato'

export default motion({
  slide: {
    duration: 650,
    ease: 'cubic-bezier(0.7, 0, 0.2, 1)',
    phone: { duration: 480 },
    reduced: { duration: 0 },
  },
})
