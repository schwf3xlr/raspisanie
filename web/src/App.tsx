import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import Landing from './pages/Landing';
import ScheduleApp from './pages/ScheduleApp';
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminSchedule from './pages/admin/AdminSchedule';
import AdminTemplate from './pages/admin/AdminTemplate';
import AdminDictionaries from './pages/admin/AdminDictionaries';
import DialogRoot from './components/DialogRoot';
import { useTheme } from './lib/hooks';
import { checkForUpdate } from './lib/update-check';

export default function App() {
  useTheme();

  useEffect(() => {
    document.title = 'Расписание · СОШ №44';
    // Проверка обновлений — только в Android-приложении, в браузере no-op.
    // Небольшая задержка, чтобы UI успел появиться первым.
    const t = setTimeout(() => { void checkForUpdate(); }, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Routes>
        {/* В Android-приложении лендинг не показываем — сразу ведём на расписание. */}
        <Route path="/" element={Capacitor.isNativePlatform() ? <Navigate to="/app" replace /> : <Landing />} />
        <Route path="/app" element={<ScheduleApp />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="schedule" element={<AdminSchedule />} />
          <Route path="template" element={<AdminTemplate />} />
          <Route path="dictionaries" element={<AdminDictionaries />} />
        </Route>
        <Route path="*" element={<Landing />} />
      </Routes>
      <DialogRoot />
    </>
  );
}
