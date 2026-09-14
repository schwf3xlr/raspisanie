import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AdminRole, type AdminUser } from '../../lib/admin-api';
import { confirmDialog } from '../../lib/dialog';

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await adminApi.users();
      setUsers(r.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const [newLogin, setNewLogin] = useState('');
  const [newDisplay, setNewDisplay] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('school');
  const [createBusy, setCreateBusy] = useState(false);

  const createUser = async () => {
    setCreateBusy(true);
    setError(null);
    try {
      await adminApi.createUser({
        login: newLogin.trim(),
        password: newPassword,
        role: newRole,
        displayName: newDisplay.trim() || undefined,
      });
      setNewLogin(''); setNewDisplay(''); setNewPassword(''); setNewRole('school');
      setCreating(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setCreateBusy(false); }
  };

  const changeRole = async (u: AdminUser, next: AdminRole) => {
    if (u.role === next) return;
    try {
      await adminApi.updateUser(u.id, { role: next });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const resetPassword = async (u: AdminUser) => {
    const newPass = prompt(`Новый пароль для ${u.login} (минимум 6 символов):`);
    if (!newPass) return;
    if (newPass.length < 6) { setError('Пароль слишком короткий'); return; }
    try {
      await adminApi.updateUser(u.id, { password: newPass });
      alert('Пароль обновлён');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const deleteUser = async (u: AdminUser) => {
    const ok = await confirmDialog({
      title: `Удалить ${u.login}?`,
      message: 'Учётная запись будет удалена, все её сессии сброшены.',
      confirmText: 'Удалить', danger: true,
    });
    if (!ok) return;
    try {
      await adminApi.deleteUser(u.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="min-h-screen">
      <header className="px-4 md:px-8 pt-6 md:pt-8 pb-5 border-b border-line-light dark:border-line-dark">
        <h1 className="font-serif text-[28px] md:text-[36px] -tracking-[.02em] leading-none font-normal">Администраторы</h1>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[13.5px] mt-1.5">
          Пользователи с доступом в панель управления. Роль «Технический» - полный доступ, включая эту страницу.
        </p>
      </header>

      <div className="px-4 md:px-8 py-6">
        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-950/40 border border-red-300/60 dark:border-red-900/60 text-red-700 dark:text-red-400 rounded-xl px-3 py-2.5 text-[13.5px]">
            {error}
          </div>
        )}

        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="mb-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[13.5px] hover:opacity-90"
          >
            + Добавить администратора
          </button>
        )}

        {creating && (
          <div className="mb-6 bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-2xl p-5">
            <div className="text-[13.5px] font-semibold mb-3">Новый администратор</div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark mb-1">Логин</div>
                <input value={newLogin} onChange={e => setNewLogin(e.target.value)} placeholder="ivanova"
                  className="w-full bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark" />
              </label>
              <label className="block">
                <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark mb-1">Имя (опционально)</div>
                <input value={newDisplay} onChange={e => setNewDisplay(e.target.value)} placeholder="Иванова М.С."
                  className="w-full bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark" />
              </label>
              <label className="block md:col-span-1">
                <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark mb-1">Пароль (минимум 6)</div>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password"
                  className="w-full bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark" />
              </label>
              <label className="block">
                <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark mb-1">Роль</div>
                <select value={newRole} onChange={e => setNewRole(e.target.value as AdminRole)}
                  className="w-full bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark">
                  <option value="school">Администратор школы</option>
                  <option value="tech">Технический администратор</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setCreating(false); setError(null); }} className="px-4 py-2 rounded-lg bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark text-[13.5px] font-semibold">Отмена</button>
              <button onClick={createUser} disabled={createBusy || !newLogin.trim() || newPassword.length < 6}
                className="px-4 py-2 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark text-[13.5px] font-semibold disabled:opacity-50">
                {createBusy ? 'Создаём…' : 'Создать'}
              </button>
            </div>
          </div>
        )}

        {users == null ? (
          <div className="text-ink-2-light dark:text-ink-2-dark text-[14px]">Загружаем…</div>
        ) : users.length === 0 ? (
          <div className="text-ink-3-light dark:text-ink-3-dark text-[14px]">Нет ни одного администратора.</div>
        ) : (
          <div className="border border-line-light dark:border-line-dark rounded-2xl overflow-hidden">
            <table className="min-w-full text-[14px]">
              <thead className="bg-panel-light dark:bg-panel-dark text-[11px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark">
                <tr>
                  <th className="text-left px-4 py-2.5">Логин</th>
                  <th className="text-left px-4 py-2.5">Имя</th>
                  <th className="text-left px-4 py-2.5">Роль</th>
                  <th className="text-left px-4 py-2.5">Создан</th>
                  <th className="text-right px-4 py-2.5">Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t border-line-light dark:border-line-dark">
                    <td className="px-4 py-3 font-semibold">{u.login}</td>
                    <td className="px-4 py-3 text-ink-2-light dark:text-ink-2-dark">{u.displayName || '-'}</td>
                    <td className="px-4 py-3">
                      <select value={u.role} onChange={e => changeRole(u, e.target.value as AdminRole)}
                        className="bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-2.5 py-1.5 text-[13.5px]">
                        <option value="school">Школы</option>
                        <option value="tech">Технический</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-ink-3-light dark:text-ink-3-dark tabular-nums text-[12.5px]">
                      {new Date(u.createdAt).toLocaleDateString('ru')}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => resetPassword(u)} className="text-[12.5px] font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark px-2">Сменить пароль</button>
                      <button onClick={() => deleteUser(u)} className="text-[12.5px] font-semibold text-red-500 hover:text-red-600 dark:hover:text-red-400 px-2">Удалить</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
