import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import "./index.css";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { ProjectsPage } from "./pages/Projects";
import { ProjectPage } from "./pages/Project";
import { BuildPage } from "./pages/Build";
import { LandingPage } from "./pages/Landing";
import { AuthPage } from "./pages/Auth";
import { SettingsPage } from "./pages/Settings";
import { AuthProvider, RequireAuth } from "./auth/auth";

function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="font-mono text-xs text-zinc-500">404</div>
      <h1 className="text-lg font-semibold">Page not found</h1>
      <Link to="/projects" className="text-sm text-accent-400 hover:underline">
        Back to projects
      </Link>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route index element={<LandingPage />} />
            <Route path="login" element={<AuthPage mode="login" />} />
            <Route path="signup" element={<AuthPage mode="signup" />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/:id" element={<ProjectPage />} />
              <Route path="builds/:id" element={<BuildPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
