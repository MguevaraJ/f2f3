import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-sans/400.css'
import '@fontsource/noto-sans/700.css'
import '@fontsource/noto-sans/800.css'
import './popup.css'
import { CapturePopupView } from './CapturePopupView'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CapturePopupView />
  </StrictMode>
)
