import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type AdminStats } from '../../lib/admin-api';

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  useEffect(() => { adminApi.stats().then(setStats).catch(() => {}); }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-10">
        <h1 className="font-serif text-[42px] -tracking-[.02em] leading-none font-normal">Дашборд</h1>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[14.5px] mt-2">
          Общая статистика и быстрый доступ к разделам.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-10">
        <StatCard label="Классов" value={stats?.classes ?? '-'} />
        <StatCard label="Учителей" value={stats?.teachers ?? '-'} />
        <StatCard label="Предметов" value={stats?.subjects ?? '-'} />
        <StatCard label="Кабинетов" value={stats?.rooms ?? '-'} />
      </div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-10">
        <StatCard label="В шаблоне" value={stats?.templateLessons ?? '-'} small />
        <StatCard label="Замен" value={stats?.overrides ?? '-'} small accent={!!stats?.overrides} />
        <StatCard label="На дистанте" value={stats?.distant ?? '-'} small accent={!!stats?.distant} />
        <StatCard label="Опубликовано дней" value={stats?.published ?? '-'} small />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ActionCard
          to="/admin/schedule"
          title="Расписание"
          body="Редактор недели: правки на конкретную дату, дистант, публикация."
        />
        <ActionCard
          to="/admin/template"
          title="Стандартное расписание"
          body="Шаблон, из которого копируется каждая неделя. Меняй только когда меняется постоянное расписание."
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, small = false, accent = false }: { label: string; value: number | string; small?: boolean; accent?: boolean }) {
  return (
    <div className="bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-2xl p-5">
      <div className="text-[11.5px] font-semibold tracking-[.1em] uppercase text-ink-3-light dark:text-ink-3-dark mb-1.5">{label}</div>
      <div className={['font-serif -tracking-[.02em] leading-none tabular-nums', small ? 'text-[26px] font-medium' : 'text-[38px] font-normal', accent ? 'text-accent dark:text-accent-dark' : ''].join(' ')}>
        {value}
      </div>
    </div>
  );
}
function ActionCard({ to, title, body }: { to: string; title: string; body: string }) {
  return (
    <Link to={to} className="bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-2xl p-6 hover:bg-line-2-light dark:hover:bg-line-2-dark transition-colors group">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[15px]">{title}</h3>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-ink-3-light dark:text-ink-3-dark group-hover:text-ink-light dark:group-hover:text-ink-dark transition-colors"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
      </div>
      <p className="text-ink-2-light dark:text-ink-2-dark text-[13.5px] leading-relaxed">{body}</p>
    </Link>
  );
}
