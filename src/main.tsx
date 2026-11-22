import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/opsz.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/motion.css'
import App from './App.tsx'
import { applyFreeze } from './lib/freeze'

// Start the intro only once the satellite image is decoded, so it reveals the same way every time.
async function boot() {
  const img = new Image()
  img.src = '/map/city-sg.jpg'
  await Promise.race([img.decode().catch(() => undefined), new Promise((r) => setTimeout(r, 2500))])
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  applyFreeze()
}

boot()
