import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import modulato from '@modulato/vite'

export default defineConfig({
  plugins: [react(), modulato()],
})
