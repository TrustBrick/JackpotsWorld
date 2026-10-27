import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// COOKIE-CONSENT: fonts are served from this site, not fetched from Google, so
// loading a page tells no third party who the visitor is.
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'
import '@fontsource/playfair-display/500.css'
import '@fontsource/playfair-display/600.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/playfair-display/800.css'
import '@fontsource/playfair-display/500-italic.css'
import './index.css'
import './i18n'

// ✅ NO BrowserRouter here — App.jsx owns the router
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)