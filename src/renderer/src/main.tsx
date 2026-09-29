import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-sans/400.css'
import '@fontsource/noto-sans/600.css'
import '@fontsource/noto-sans/700.css'
import '@fontsource/noto-sans/800.css'
import './styles/theme.css'
import './styles/layout.css'
import './styles/gallery.css'
import './styles/details.css'
import './styles/viewer.css'
import './styles/pages.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
