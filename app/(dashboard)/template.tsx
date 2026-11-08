'use client'
import { motion } from 'motion/react'
import { EASE_OUT } from '@/components/ui/motion'

// A template re-mounts on every navigation, so each page glides in.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="flex-1 flex flex-col"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0, transitionEnd: { transform: 'none' } }}
      transition={{ duration: 0.38, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}
