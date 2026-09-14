import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { api } from '../lib/api';
import { DAY_SHORT, type Day, type DayName, type SavedViewer, type Teacher, type Week } from '../lib/types';
import {
  addDays,
  fmtDate,
  fmtWeekLabel,
  fromISODate,
  isSameDate,
  mondayOf,
  relativeBadge,
  toISODate,
} from '../lib/time';
import { useLocalStorage, useMinuteTick, useTheme } from '../lib/hooks';
import { syncViewer } from '../lib/push';
import LessonRow from '../components/LessonRow';
import ClassPicker from '../components/ClassPicker';
import TeacherPicker from '../components/TeacherPicker';
import SettingsSheet from '../components/SettingsSheet';
import SchoolLogo from '../components/SchoolLogo';

// Одноразовая миграция старого сохранённого ключа `class` → новый `viewer`.
function migrateOldClassKey(): SavedViewer | null {
  try {
    const old = localStorage.getItem('class');
    if (old) {
      const parsed = JSON.parse(old);
      if (typeof parsed === 'string' && parsed) {
        localStorage.removeItem('class');
        return { mode: 'class', className: parsed };
      }
    }
  } catch { /* ignore */ }
  return null;
}

export default function ScheduleApp() {
  const navigate = useNavigate();
  const [viewer, setViewer] = useLocalStorage<SavedViewer | null>('viewer', () => migrateOldClassKey());
  const [pickingMode, setPickingMode] = useState<'class' | 'teacher'>('class');
  const [classes, setClasses] = useState<string[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [monday, setMonday] = useState<Date>(() => mondayOf(new Date()));
  const [dateIso, setDateIso] = useState<string>(() => {
    const now = new Date();
    const dow = now.getDay();
    if (dow === 0 || dow === 6) return toISODate(mondayOf(now));
    return toISODate(now);
  });
  const [week, setWeek] = useState<Week | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeMode, setThemeMode] = useTheme();

  useMinuteTick();

  useEffect(() => {
    void syncViewer(viewer);
  }, [viewer]);

  useEffect(() => {
    if (viewer) return;
    if (pickingMode === 'class') {
      api.classes().then(r => setClasses(r.classes)).catch(err => setError(err.message));
    } else {
      api.teachers().then(r => setTeachers(r.teachers)).catch(err => setError(err.message));
    }
  }, [viewer, pickingMode]);

  useEffect(() => {
    if (!viewer) { setWeek(null); setLoading(false); return; }
    setLoading(true); setError(null);
    const iso = toISODate(monday);
    const promise = viewer.mode === 'teacher' && viewer.teacherId
      ? api.weekTeacher(viewer.teacherId, iso)
      : viewer.className
        ? api.week(viewer.className, iso)
        : null;
    if (!promise) { setLoading(false); return; }
    promise.then(setWeek).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [viewer, monday]);

  const currentDay: Day | null = useMemo(() => {
    if (!week) return null;
    return week.days.find(d => d.date === dateIso) ?? week.days[0] ?? null;
  }, [week, dateIso]);

  const goPrevWeek = () => { const p = addDays(monday, -7); setMonday(p); setDateIso(toISODate(p)); };
  const goNextWeek = () => { const n = addDays(monday, 7); setMonday(n); setDateIso(toISODate(n)); };
  const goToday = () => {
    const t = new Date();
    setMonday(mondayOf(t));
    const dow = t.getDay();
    if (dow >= 1 && dow <= 5) setDateIso(toISODate(t));
    else setDateIso(toISODate(mondayOf(t)));
  };

  if (loading && !week && classes == null && teachers == null) return <LoadingState />;
  if (error && !week) return <ErrorState message={error} onRetry={() => location.reload()} />;

  if (!viewer) {
    if (pickingMode === 'class') {
      if (!classes) return <LoadingState />;
      if (classes.length === 0) return <ErrorState message="В базе пока нет классов. Зайдите в панель управления и заведите их." onRetry={() => location.reload()} />;
      return (
        <ClassPicker
          classes={classes}
          onPick={cls => setViewer({ mode: 'class', className: cls })}
          onSwitchToTeacher={() => setPickingMode('teacher')}
        />
      );
    }
    if (!teachers) return <LoadingState />;
    return (
      <TeacherPicker
        teachers={teachers}
        onPick={t => setViewer({ mode: 'teacher', teacherId: t.id, teacherName: t.shortName })}
        onSwitchToClass={() => setPickingMode('class')}
      />
    );
  }

  if (!week) return <LoadingState />;

  const badge = relativeBadge(fromISODate(dateIso));
  const currentDate = fromISODate(dateIso);
  const today = new Date();
  const isTeacherMode = viewer.mode === 'teacher';
  const headerSubtitle = isTeacherMode
    ? (viewer.teacherName ?? week.teacherName ?? '')
    : (viewer.className ?? '');
  const headerLabel = isTeacherMode ? 'Учитель' : 'Класс';

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-6 pb-10 pt-2 md:pt-6">
        <header className="sticky top-0 bg-bg-light dark:bg-bg-dark z-10 flex justify-between items-center py-5 pb-2">
          <div className="flex items-center gap-2.5 text-[14px] text-ink-2-light dark:text-ink-2-dark font-medium min-w-0">
            <SchoolLogo size={26} className="rounded-lg" />
            <span className="truncate">{headerLabel} <b className="text-ink-light dark:text-ink-dark font-semibold">{headerSubtitle}</b></span>
          </div>
          <div className="flex gap-1.5 items-center shrink-0">
            {!Capacitor.isNativePlatform() && (
              <IconButton title="Домой" onClick={() => navigate('/')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></svg>
              </IconButton>
            )}
            <IconButton title="Настройки" onClick={() => setSettingsOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round"><circle cx={12} cy={12} r={3}/><path d="M19.4 15a1.7 1.7 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.82-.33 1.7 1.7 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.7 1.7 0 00-1-1.51 1.7 1.7 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.7 1.7 0 00.33-1.82 1.7 1.7 0 00-1.51-1H3a2 2 0 010-4h.09a1.7 1.7 0 001.51-1 1.7 1.7 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.7 1.7 0 001.82.33H9a1.7 1.7 0 001-1.51V3a2 2 0 014 0v.09a1.7 1.7 0 001 1.51 1.7 1.7 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.7 1.7 0 00-.33 1.82V9a1.7 1.7 0 001.51 1H21a2 2 0 010 4h-.09a1.7 1.7 0 00-1.51 1z"/></svg>
            </IconButton>
          </div>
        </header>

        <div className="py-5 border-b border-line-light dark:border-line-dark">
          <h1 className="font-serif text-[44px] sm:text-[56px] md:text-[76px] -tracking-[.03em] leading-[.95] break-words">
            {currentDay?.day ?? '-'}
          </h1>
          <div className="flex items-center gap-2.5 mt-3 text-[15px] text-ink-2-light dark:text-ink-2-dark tabular-nums">
            <span>{fmtDate(currentDate)}</span>
            {badge && (
              <span className="inline-flex items-center gap-1.5 bg-accent-soft dark:bg-accent-soft-dark text-accent dark:text-accent-dark px-2.5 py-0.5 rounded-full text-[12.5px] font-semibold">
                <span className="w-1.5 h-1.5 bg-accent dark:bg-accent-dark rounded-full" />{badge}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between my-5">
          <button onClick={goPrevWeek} className="w-10 h-10 rounded-xl border border-line-light dark:border-line-dark grid place-items-center text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark hover:bg-panel-light dark:hover:bg-panel-dark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button onClick={goToday} className="text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark tabular-nums">
            {fmtWeekLabel(monday)}
          </button>
          <button onClick={goNextWeek} className="w-10 h-10 rounded-xl border border-line-light dark:border-line-dark grid place-items-center text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark hover:bg-panel-light dark:hover:bg-panel-dark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6"/></svg>
          </button>
        </div>

        <div className="flex gap-1.5 -mx-6 px-6 pb-1.5 overflow-x-auto no-scrollbar mb-4">
          {week.days.map(d => {
            const on = d.date === dateIso;
            const date = fromISODate(d.date);
            const isToday = isSameDate(date, today);
            return (
              <button
                key={d.date}
                onClick={() => setDateIso(d.date)}
                className={[
                  'flex-shrink-0 min-w-[52px] px-3 py-2 rounded-2xl border transition-colors text-center',
                  on
                    ? 'bg-ink-light text-bg-light border-ink-light dark:bg-ink-dark dark:text-bg-dark dark:border-ink-dark'
                    : d.published
                      ? 'bg-transparent border-transparent text-ink-2-light dark:text-ink-2-dark hover:bg-panel-light dark:hover:bg-panel-dark'
                      : 'bg-transparent border-dashed border-line-light dark:border-line-dark text-ink-3-light dark:text-ink-3-dark',
                ].join(' ')}
              >
                <div className={['text-[10.5px] font-semibold tracking-[.06em] uppercase', on ? 'opacity-70' : 'opacity-60'].join(' ')}>
                  {d.day ? DAY_SHORT[d.day as DayName] ?? d.day : '-'}
                </div>
                <div className="font-serif text-[22px] font-medium leading-none tabular-nums mt-0.5">
                  {date.getDate()}
                </div>
                {isToday && (
                  <div className={['mx-auto mt-1 w-1 h-1 rounded-full', on ? 'bg-white' : 'bg-accent dark:bg-accent-dark'].join(' ')} />
                )}
                {d.isDistantAllDay && !on && (
                  <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-distant dark:text-distant-dark">Дист</div>
                )}
              </button>
            );
          })}
        </div>

        {!currentDay ? (
          <div className="py-16 text-center text-ink-3-light dark:text-ink-3-dark">Нет данных</div>
        ) : !currentDay.published ? (
          <NotPublished />
        ) : (
          <>
            {currentDay.isDistantAllDay && (
              <div className="mb-4 bg-distant-soft dark:bg-distant-soft-dark border border-distant/20 dark:border-distant-dark/30 rounded-2xl p-4 flex gap-3 items-start">
                <div className="w-9 h-9 rounded-xl bg-distant dark:bg-distant-dark text-white grid place-items-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>
                </div>
                <div>
                  <div className="font-semibold text-distant dark:text-distant-dark text-[15px] leading-tight">Дистанционный день</div>
                  <div className="text-[13.5px] text-ink-2-light dark:text-ink-2-dark mt-1 leading-relaxed">
                    {currentDay.distantAllDayNote || 'Все уроки сегодня проходят онлайн.'}
                  </div>
                </div>
              </div>
            )}
            <div className="pt-2 pb-5">
              {currentDay.lessons.length === 0 ? (
                <div className="py-16 text-center text-ink-3-light dark:text-ink-3-dark">
                  <div className="font-serif text-[22px] text-ink-2-light dark:text-ink-2-dark mb-1.5">
                    {isTeacherMode ? 'Уроков нет' : 'Пусто'}
                  </div>
                  {isTeacherMode ? 'В этот день у Вас нет уроков' : 'В этот день уроков нет'}
                </div>
              ) : (
                currentDay.lessons.map((l, idx) => (
                  <LessonRow
                    key={`${l.number}-${l.className ?? ''}-${idx}`}
                    lesson={l}
                    isToday={currentDay.isToday}
                    distantDay={currentDay.isDistantAllDay}
                    teacherMode={isTeacherMode}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        viewer={viewer}
        onChangeViewer={() => { setViewer(null); setSettingsOpen(false); }}
        theme={themeMode}
        onChangeTheme={setThemeMode}
      />
    </div>
  );
}

function NotPublished() {
  return (
    <div className="py-14 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark grid place-items-center mx-auto mb-5 text-ink-3-light dark:text-ink-3-dark">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      </div>
      <h2 className="font-serif text-[24px] -tracking-[.01em] mb-2">Расписание ещё не готово</h2>
      <p className="text-ink-2-light dark:text-ink-2-dark text-[14px] leading-relaxed max-w-xs mx-auto">
        Обновится, когда завуч опубликует его. Загляните позже.
      </p>
    </div>
  );
}

function IconButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button title={title} onClick={onClick}
      className="w-9 h-9 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark grid place-items-center text-ink-2-light dark:text-ink-2-dark hover:bg-line-2-light dark:hover:bg-line-2-dark hover:text-ink-light dark:hover:text-ink-dark transition-colors">
      <span className="w-4 h-4 block [&>svg]:w-4 [&>svg]:h-4">{children}</span>
    </button>
  );
}
function LoadingState() {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="w-8 h-8 border-[3px] border-line-light dark:border-line-dark border-t-accent rounded-full animate-spin" />
    </div>
  );
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="max-w-sm mx-auto py-24 px-6 text-center">
      <h2 className="font-serif font-medium text-[24px] -tracking-[.01em] mb-2">Не получилось</h2>
      <p className="text-ink-2-light dark:text-ink-2-dark text-[14.5px] mb-6">{message}</p>
      <button onClick={onRetry} className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[14px]">
        Повторить
      </button>
    </div>
  );
}
