import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import "./index.css";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { ProjectsPage } from "./pages/Projects";
import { ProjectPage } from "./pages/Project";
import { BuildPage } from "./pages/Build";

function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="font-mono text-xs text-zinc-500">404</div>
      <h1 className="text-lg font-semibold">Page not found</h1>
      <Link to="/" className="text-sm text-accent-400 hover:underline">
        Back to projects
      </Link>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectPage />} />
            <Route path="builds/:id" element={<BuildPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
