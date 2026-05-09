import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import HomePage from '../pages/HomePage';
import BuilderPage from '../pages/BuilderPage';
import RunnerPage from '../pages/RunnerPage';
import HistoryPage from '../pages/HistoryPage';
import SettingsPage from '../pages/SettingsPage';
import GeneratorPage from '../pages/GeneratorPage';
import AIGeneratorPage from '../pages/AIGeneratorPage';
import DOMInspectorPage from '../pages/DOMInspectorPage';
import LiveBrowserPage from '../pages/LiveBrowserPage';
import AITestPage from '../pages/AITestPage';

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="/home"          element={<HomePage />} />
        <Route path="/builder"       element={<BuilderPage />} />
        <Route path="/builder/:flowId" element={<BuilderPage />} />
        <Route path="/generator"     element={<GeneratorPage />} />
        <Route path="/ai"            element={<AIGeneratorPage />} />
        <Route path="/dom-inspector" element={<DOMInspectorPage />} />
        <Route path="/live"          element={<LiveBrowserPage />} />
        <Route path="/ai-test"       element={<AITestPage />} />
        <Route path="/runner"        element={<RunnerPage />} />
        <Route path="/history"       element={<HistoryPage />} />
        <Route path="/settings"      element={<SettingsPage />} />
        <Route path="*"              element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}
