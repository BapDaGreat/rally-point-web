import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import './index.css'
import App from './App.tsx'

function Root() {
  useEffect(() => {
    const redirect = sessionStorage.getItem('ghpages-redirect')
    if (redirect) {
      sessionStorage.removeItem('ghpages-redirect')
      // optional: map path redirects if we ever leave hash mode
    }
  }, [])
  return (
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>
  )
}

createRoot(document.getElementById('root')!).render(<Root />)
