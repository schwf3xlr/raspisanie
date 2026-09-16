import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import Landing from './pages/Landing';
import ScheduleApp from './pages/ScheduleApp';
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminSchedule from './pages/admin/AdminSchedule';
import AdminTemplate from './pages/admin/AdminTemplate';
import AdminDictionaries from './pages/admin/AdminDictionaries';
import AdminUsers from './pages/admin/AdminUsers';
import AdminApp from './pages/admin/AdminApp';
import AdminSheets from './pages/admin/AdminSheets';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import FullGridPage from './pages/FullGridPage';
import ChangelogPage from './pages/ChangelogPage';
import DialogRoot from './components/DialogRoot';
import CookieBanner from './components/CookieBanner';
import { useTheme } from './lib/hooks';
import { checkForUpdate } from './lib/update-check';
import { initPush, isPushSupported } from './lib/push';
import type { SavedViewer } from './lib/types';

export default function App() {
  useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Расписание · СОШ №44';
    // Проверка обновлений - только в Android-приложении, в браузере no-op.
    // Небольшая задержка, чтобы UI успел появиться первым.
    const t = setTimeout(() => { void checkForUpdate(); }, 1500);

    if (isPushSupported()) {
      const viewer = readViewerFromStorage();
      void initPush({
        viewer,
        onNotificationTap: () => {
          // По клику на уведомление - открываем расписание.
          navigate('/app');
        },
      });
    }

    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <>
      <Routes>
        {/* В Android-приложении лендинг не показываем - сразу ведём на расписание. */}
        <Route path="/" element={Capacitor.isNativePlatform() ? <Navigate to="/app" replace /> : <Landing />} />
        <Route path="/app" element={<ScheduleApp />} />
        <Route path="/all" element={<FullGridPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="schedule" element={<AdminSchedule />} />
          <Route path="template" element={<AdminTemplate />} />
          <Route path="dictionaries" element={<AdminDictionaries />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="app" element={<AdminApp />} />
          <Route path="sheets" element={<AdminSheets />} />
        </Route>
        <Route path="*" element={<Landing />} />
      </Routes>
      <DialogRoot />
      <CookieBanner />
    </>
  );
}

function readViewerFromStorage(): SavedViewer | null {
  try {
    const raw = localStorage.getItem('viewer');
    return raw ? (JSON.parse(raw) as SavedViewer) : null;
  } catch {
    return null;
  }
}
