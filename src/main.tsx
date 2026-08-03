import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './components/RequireAuth'
import { UpdatePrompt } from './components/UpdatePrompt'
import { AuthProvider } from './hooks/useAuth'
import { Capture } from './screens/Capture'
import { Login } from './screens/Login'
import { NotFound } from './screens/NotFound'
import { ProjectDetail } from './screens/ProjectDetail'
import { ProjectNew } from './screens/ProjectNew'
import { Projects } from './screens/Projects'
import { PromptEditor } from './screens/PromptEditor'
import './index.css'

// Vite's BASE_URL carries the GitHub Pages subpath. Router basename wants it
// without the trailing slash.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route element={<AppShell />}>
            {/* Capture is the index route: the home-screen icon lands here with
                no intermediate navigation, and it stays outside RequireAuth so
                an idea can be captured offline and signed out. */}
            <Route index element={<Capture />} />
            <Route path="login" element={<Login />} />

            {/* Everything below needs the backend to show anything at all. */}
            <Route element={<RequireAuth />}>
              <Route path="projects" element={<Projects />} />
              <Route path="projects/new" element={<ProjectNew />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
              <Route path="prompts/:id" element={<PromptEditor />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    <UpdatePrompt />
  </StrictMode>,
)
