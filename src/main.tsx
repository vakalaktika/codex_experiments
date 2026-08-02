import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { UpdatePrompt } from './components/UpdatePrompt'
import { Capture } from './screens/Capture'
import { NotFound } from './screens/NotFound'
import { Projects } from './screens/Projects'
import './index.css'

// Vite's BASE_URL carries the GitHub Pages subpath. Router basename wants it
// without the trailing slash.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <Routes>
        <Route element={<AppShell />}>
          {/* Capture is the index route: the home-screen icon lands here with
              no intermediate navigation. */}
          <Route index element={<Capture />} />
          <Route path="projects" element={<Projects />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
    <UpdatePrompt />
  </StrictMode>,
)
