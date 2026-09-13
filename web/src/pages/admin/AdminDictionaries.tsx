import { useEffect, useState } from 'react';
import { adminApi, type AdminClass, type AdminDictionaries, type AdminRoom, type AdminSubject, type AdminTeacher } from '../../lib/admin-api';
import { confirmDialog } from '../../lib/dialog';

type Tab = 'teachers' | 'subjects' | 'rooms' | 'classes';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'teachers', label: 'Учителя' },
  { key: 'subjects', label: 'Предметы' },
  { key: 'rooms', label: 'Кабинеты' },
  { key: 'classes', label: 'Классы' },
];

export default function AdminDictionaries() {
  const [tab, setTab] = useState<Tab>('teachers');
  const [data, setData] = useState<AdminDictionaries | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => adminApi.dictionaries().then(setData).catch(err => setError(err.message));
  useEffect(() => { refresh(); }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-8">
        <h1 className="font-serif text-[42px] -tracking-[.02em] leading-none font-normal">Справочники</h1>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[14.5px] mt-2">
          Общие списки, из которых выбираются значения при заполнении расписания.
        </p>
      </div>

      <div className="-mx-4 md:mx-0 mb-6 px-4 md:px-0 overflow-x-auto no-scrollbar">
        <div className="inline-flex gap-1 bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-full p-1 min-w-max">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={[
                'shrink-0 px-3.5 md:px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors',
                tab === t.key ? 'bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark' : 'text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark',
              ].join(' ')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50 rounded-xl px-4 py-3 text-[13.5px]">{error}</div>}

      {!data ? (
        <div className="py-16 text-center text-ink-3-light dark:text-ink-3-dark">Загружаем…</div>
      ) : (
        <>
          {tab === 'teachers' && <TeachersTab items={data.teachers} refresh={refresh} onError={setError} />}
          {tab === 'subjects' && <SubjectsTab items={data.subjects} refresh={refresh} onError={setError} />}
          {tab === 'rooms' && <RoomsTab items={data.rooms} refresh={refresh} onError={setError} />}
          {tab === 'classes' && <ClassesTab items={data.classes} refresh={refresh} onError={setError} />}
        </>
      )}
    </div>
  );
}

function ListCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-2xl overflow-hidden">{children}</div>;
}

// --- Teachers ---
function TeachersTab({ items, refresh, onError }: { items: AdminTeacher[]; refresh: () => void; onError: (m: string) => void }) {
  const [full, setFull] = useState('');
  const [short, setShort] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AdminTeacher | null>(null);

  const add = async () => {
    if (!full.trim() || !short.trim()) return;
    setBusy(true);
    try { await adminApi.createTeacher(full.trim(), short.trim()); setFull(''); setShort(''); refresh(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    const t = items.find(x => x.id === id);
    const ok = await confirmDialog({
      title: 'Удалить учителя?',
      message: t ? `«${t.shortName}» будет удалён из справочника.` : 'Учитель будет удалён.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try { await adminApi.deleteTeacher(id); refresh(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 mb-5">
        <input type="text" value={full} onChange={e => setFull(e.target.value)} placeholder="ФИО (Иванова Мария Сергеевна)"
          className="bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark" />
        <input type="text" value={short} onChange={e => setShort(e.target.value)} placeholder="Кратко (Иванова М.С.)"
          className="bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark" />
        <button onClick={add} disabled={busy || !full || !short} className="px-5 py-2.5 rounded-xl bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[14px] disabled:opacity-50">Добавить</button>
      </div>
      <ListCard>
        {items.length === 0 ? (
          <div className="p-8 text-center text-ink-3-light dark:text-ink-3-dark">Пусто</div>
        ) : items.map(t => (
          <div key={t.id} className="px-4 md:px-5 py-3 border-t border-line-light dark:border-line-dark first:border-t-0">
            {editing?.id === t.id ? (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto_auto] gap-2 items-center">
                <input defaultValue={t.fullName} id={`f-${t.id}`} placeholder="ФИО" className="bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px]" />
                <input defaultValue={t.shortName} id={`s-${t.id}`} placeholder="Кратко" className="bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px]" />
                <div className="flex gap-2 md:contents">
                  <button onClick={async () => {
                    const f = (document.getElementById(`f-${t.id}`) as HTMLInputElement).value.trim();
                    const s = (document.getElementById(`s-${t.id}`) as HTMLInputElement).value.trim();
                    try { await adminApi.updateTeacher(t.id, f, s); setEditing(null); refresh(); }
                    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
                  }} className="flex-1 md:flex-none px-4 py-2 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark text-[13px] font-semibold">Сохранить</button>
                  <button onClick={() => setEditing(null)} className="flex-1 md:flex-none px-4 py-2 rounded-lg bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark">Отмена</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[14px] truncate">{t.fullName}</div>
                  <div className="text-ink-3-light dark:text-ink-3-dark text-[12px]">{t.shortName}</div>
                </div>
                <button onClick={() => setEditing(t)} className="text-[13px] text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark font-medium shrink-0">Изменить</button>
                <button onClick={() => remove(t.id)} className="text-[13px] text-ink-3-light dark:text-ink-3-dark hover:text-red-500 font-medium shrink-0">Удалить</button>
              </div>
            )}
          </div>
        ))}
      </ListCard>
    </>
  );
}

function SubjectsTab({ items, refresh, onError }: { items: AdminSubject[]; refresh: () => void; onError: (m: string) => void }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<AdminSubject | null>(null);
  const add = async () => {
    if (!name.trim()) return;
    try { await adminApi.createSubject(name.trim()); setName(''); refresh(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-5">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Название (напр., Алгебра)"
          className="bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark" />
        <button onClick={add} disabled={!name} className="px-5 py-2.5 rounded-xl bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[14px] disabled:opacity-50">Добавить</button>
      </div>
      <ListCard>
        {items.map(s => (
          <div key={s.id} className="px-4 md:px-5 py-3 border-t border-line-light dark:border-line-dark first:border-t-0">
            {editing?.id === s.id ? (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-center">
                <input defaultValue={s.name} id={`sub-${s.id}`} className="bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px]" />
                <div className="flex gap-2 md:contents">
                  <button onClick={async () => {
                    const v = (document.getElementById(`sub-${s.id}`) as HTMLInputElement).value.trim();
                    try { await adminApi.updateSubject(s.id, v); setEditing(null); refresh(); }
                    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
                  }} className="flex-1 md:flex-none px-4 py-2 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark text-[13px] font-semibold">Сохранить</button>
                  <button onClick={() => setEditing(null)} className="flex-1 md:flex-none px-4 py-2 rounded-lg bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark">Отмена</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0 font-medium text-[14px] truncate">{s.name}</div>
                <button onClick={() => setEditing(s)} className="text-[13px] text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark font-medium shrink-0">Изменить</button>
                <button onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Удалить предмет?',
                    message: `«${s.name}» будет удалён из справочника.`,
                    confirmText: 'Удалить',
                    danger: true,
                  });
                  if (!ok) return;
                  try { await adminApi.deleteSubject(s.id); refresh(); }
                  catch (e) { onError(e instanceof Error ? e.message : String(e)); }
                }} className="text-[13px] text-ink-3-light dark:text-ink-3-dark hover:text-red-500 font-medium shrink-0">Удалить</button>
              </div>
            )}
          </div>
        ))}
      </ListCard>
    </>
  );
}

function RoomsTab({ items, refresh, onError }: { items: AdminRoom[]; refresh: () => void; onError: (m: string) => void }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<AdminRoom | null>(null);
  const add = async () => {
    if (!name.trim()) return;
    try { await adminApi.createRoom(name.trim(), 'regular'); setName(''); refresh(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-5">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Номер / название (214, с/з, 101 кб.)"
          className="bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark" />
        <button onClick={add} disabled={!name} className="px-5 py-2.5 rounded-xl bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[14px] disabled:opacity-50">Добавить</button>
      </div>
      <ListCard>
        {items.map(r => (
          <div key={r.id} className="px-4 md:px-5 py-3 border-t border-line-light dark:border-line-dark first:border-t-0">
            {editing?.id === r.id ? (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-center">
                <input defaultValue={r.name} id={`rn-${r.id}`} className="bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px] tabular-nums" />
                <div className="flex gap-2 md:contents">
                  <button onClick={async () => {
                    const n = (document.getElementById(`rn-${r.id}`) as HTMLInputElement).value.trim();
                    try { await adminApi.updateRoom(r.id, n, 'regular'); setEditing(null); refresh(); }
                    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
                  }} className="flex-1 md:flex-none px-4 py-2 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark text-[13px] font-semibold">Сохранить</button>
                  <button onClick={() => setEditing(null)} className="flex-1 md:flex-none px-4 py-2 rounded-lg bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark">Отмена</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0 font-medium text-[14px] tabular-nums truncate">{r.name}</div>
                <button onClick={() => setEditing(r)} className="text-[13px] text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark font-medium shrink-0">Изменить</button>
                <button onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Удалить кабинет?',
                    message: `Кабинет «${r.name}» будет удалён из справочника.`,
                    confirmText: 'Удалить',
                    danger: true,
                  });
                  if (!ok) return;
                  try { await adminApi.deleteRoom(r.id); refresh(); }
                  catch (e) { onError(e instanceof Error ? e.message : String(e)); }
                }} className="text-[13px] text-ink-3-light dark:text-ink-3-dark hover:text-red-500 font-medium shrink-0">Удалить</button>
              </div>
            )}
          </div>
        ))}
      </ListCard>
    </>
  );
}

function ClassesTab({ items, refresh, onError }: { items: AdminClass[]; refresh: () => void; onError: (m: string) => void }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<AdminClass | null>(null);
  const add = async () => {
    if (!name.trim()) return;
    try { await adminApi.createClass(name.trim()); setName(''); refresh(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-5">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Название класса (например, 5А)"
          className="bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark" />
        <button onClick={add} disabled={!name} className="px-5 py-2.5 rounded-xl bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[14px] disabled:opacity-50">Добавить</button>
      </div>
      <ListCard>
        {items.map(c => (
          <div key={c.id} className="px-4 md:px-5 py-3 border-t border-line-light dark:border-line-dark first:border-t-0">
            {editing?.id === c.id ? (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-center">
                <input defaultValue={c.name} id={`cl-${c.id}`} className="bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px] tabular-nums" />
                <div className="flex gap-2 md:contents">
                  <button onClick={async () => {
                    const v = (document.getElementById(`cl-${c.id}`) as HTMLInputElement).value.trim();
                    try { await adminApi.updateClass(c.id, v); setEditing(null); refresh(); }
                    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
                  }} className="flex-1 md:flex-none px-4 py-2 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark text-[13px] font-semibold">Сохранить</button>
                  <button onClick={() => setEditing(null)} className="flex-1 md:flex-none px-4 py-2 rounded-lg bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark">Отмена</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0 font-medium text-[14px] tabular-nums truncate">{c.name}</div>
                <button onClick={() => setEditing(c)} className="text-[13px] text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark font-medium shrink-0">Изменить</button>
                <button onClick={async () => {
                  const ok = await confirmDialog({
                    title: `Удалить класс ${c.name}?`,
                    message: 'Все его уроки в стандартном расписании, замены и метки дистанта тоже удалятся.',
                    confirmText: 'Удалить всё',
                    danger: true,
                  });
                  if (!ok) return;
                  try { await adminApi.deleteClass(c.id); refresh(); }
                  catch (e) { onError(e instanceof Error ? e.message : String(e)); }
                }} className="text-[13px] text-ink-3-light dark:text-ink-3-dark hover:text-red-500 font-medium shrink-0">Удалить</button>
              </div>
            )}
          </div>
        ))}
      </ListCard>
    </>
  );
}
