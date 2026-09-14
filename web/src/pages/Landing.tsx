import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { School } from '../lib/types';
import SchoolLogo from '../components/SchoolLogo';

interface ApkManifest {
  versionName: string;
  apkUrl: string;
}

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [school, setSchool] = useState<School | null>(null);
  const [apk, setApk] = useState<ApkManifest | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    api.school().then(setSchool).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/downloads/latest.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then((m: ApkManifest | null) => {
        if (m?.apkUrl && m.versionName) setApk({ apkUrl: m.apkUrl, versionName: m.versionName });
      })
      .catch(() => {});
  }, []);

  const shortName = school?.short ?? 'СОШ №44';
  const fullName = school?.full ?? 'БОУ г. Омска «СОШ № 44 им. А.В. Салугина»';

  return (
    <div className="bg-bg-light dark:bg-bg-dark text-ink-light dark:text-ink-dark">
      <nav
        className={[
          'sticky top-0 z-10 flex items-center justify-between px-5 md:px-10 py-3.5 md:py-4 backdrop-blur-md transition-colors',
          scrolled ? 'border-b border-line-light dark:border-line-dark' : 'border-b border-transparent',
          'bg-bg-light/85 dark:bg-bg-dark/85',
        ].join(' ')}
      >
        <Link to="/" className="flex items-center gap-3">
          <SchoolMark />
          <div className="leading-[1.1]">
            <div className="font-semibold text-[15px] tracking-tight">{shortName}</div>
            <div className="text-ink-3-light dark:text-ink-3-dark font-medium text-[11.5px]">Расписание уроков</div>
          </div>
        </Link>
        <div className="flex items-center gap-1.5">
          <a href="#features" className="hidden md:inline-block px-3.5 py-2 rounded-full text-[14px] text-ink-2-light dark:text-ink-2-dark font-medium hover:text-ink-light dark:hover:text-ink-dark transition-colors">
            Возможности
          </a>
          <a href="#download" className="hidden md:inline-block px-3.5 py-2 rounded-full text-[14px] text-ink-2-light dark:text-ink-2-dark font-medium hover:text-ink-light dark:hover:text-ink-dark transition-colors">
            Скачать
          </a>
          <Link
            to="/app"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[14px] font-semibold bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark hover:opacity-90 transition-opacity"
          >
            Открыть
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </nav>

      <section className="max-w-6xl mx-auto px-5 md:px-10 pt-10 md:pt-24 pb-14 md:pb-24 grid gap-10 md:gap-16 md:grid-cols-[1.15fr_1fr] items-center">
        <div>
          <div className="inline-flex items-center gap-2 text-[12.5px] text-ink-2-light dark:text-ink-2-dark font-medium mb-6">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            Работает офлайн
            <span className="text-ink-3-light dark:text-ink-3-dark">·</span>
            Тёмная тема
            <span className="text-ink-3-light dark:text-ink-3-dark">·</span>
            13 классов
          </div>
          <h1 className="font-serif text-[38px] sm:text-[52px] md:text-[80px] -tracking-[.03em] leading-[1] mb-5 md:mb-6 font-normal">
            Расписание,<br />
            <span className="italic text-accent dark:text-accent-dark">всегда</span> под рукой.
          </h1>
          <p className="text-[15px] md:text-[17px] text-ink-2-light dark:text-ink-2-dark max-w-lg mb-7 md:mb-8 leading-[1.55]">
            Приложение для учеников <span className="text-ink-light dark:text-ink-dark font-medium">{shortName}</span>: посмотреть, какой сейчас урок, в каком кабинете, кто ведёт. Открывается в браузере, ставится на телефон как обычное приложение.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[15px] hover:opacity-90 transition-opacity"
            >
              Открыть расписание
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
            <a
              href="#download"
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full bg-transparent border border-line-light dark:border-line-dark font-semibold text-[15px] text-ink-light dark:text-ink-dark hover:bg-panel-light dark:hover:bg-panel-dark transition-colors"
            >
              На телефон
            </a>
          </div>
        </div>
        <PhoneMockup />
      </section>

      <section id="features" className="bg-panel-light dark:bg-panel-dark border-y border-line-light dark:border-line-dark py-14 md:py-28 px-5 md:px-10">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mb-10 md:mb-14">
            <div className="text-[12px] font-semibold tracking-[.14em] uppercase text-accent dark:text-accent-dark mb-4">
              Возможности
            </div>
            <h2 className="font-serif text-[30px] md:text-[54px] -tracking-[.02em] leading-[1.05] mb-4 md:mb-5 font-normal">
              Ничего лишнего.<br />
              Только расписание.
            </h2>
            <p className="text-[14.5px] md:text-[17px] text-ink-2-light dark:text-ink-2-dark leading-[1.6]">
              Мы сознательно не сделали «супер-приложение». Открыли, увидели уроки, закрыли. Без ленты новостей, без рекламы, без назойливой регистрации.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark rounded-2xl p-6 md:p-7 flex flex-col hover:border-accent/40 dark:hover:border-accent-dark/40 transition-colors">
                <div className="w-11 h-11 rounded-xl bg-accent-soft dark:bg-accent-soft-dark text-accent dark:text-accent-dark grid place-items-center mb-5">
                  {f.icon}
                </div>
                <h3 className="text-[17px] md:text-[18px] font-semibold -tracking-[.005em] mb-1.5">{f.title}</h3>
                <p className="text-ink-2-light dark:text-ink-2-dark text-[14px] md:text-[14.5px] leading-[1.55]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="download" className="bg-panel-light dark:bg-panel-dark border-t border-line-light dark:border-line-dark py-14 md:py-28 px-5 md:px-10">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mb-10 md:mb-14">
            <div className="text-[12px] font-semibold tracking-[.14em] uppercase text-accent dark:text-accent-dark mb-4">
              Скачать
            </div>
            <h2 className="font-serif text-[30px] md:text-[54px] -tracking-[.02em] leading-[1.05] mb-4 md:mb-5 font-normal">
              На любом телефоне.
            </h2>
            <p className="text-[14.5px] md:text-[17px] text-ink-2-light dark:text-ink-2-dark leading-[1.6]">
              Никакого App Store и Google Play - установка за 15 секунд прямо с этой страницы.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Android */}
            <div className="bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark rounded-2xl p-6 md:p-8 flex flex-col gap-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#3ddc84]/15 dark:bg-[#3ddc84]/10 grid place-items-center shrink-0">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="#3ddc84">
                    <path d="M17.6 9.48l1.84-3.18a.4.4 0 00-.69-.4l-1.86 3.22a11.86 11.86 0 00-9.78 0L5.25 5.9a.4.4 0 00-.69.4l1.84 3.18A11.6 11.6 0 001 18h22a11.6 11.6 0 00-5.4-8.52zM7 15.25a.94.94 0 110-1.88.94.94 0 010 1.88zm10 0a.94.94 0 110-1.88.94.94 0 010 1.88z"/>
                  </svg>
                </div>
                <div className="leading-[1.15] min-w-0">
                  <div className="font-semibold text-[20px] -tracking-[.005em]">Android</div>
                  <div className="text-ink-3-light dark:text-ink-3-dark text-[13px] font-medium mt-0.5">Установка APK · прямая ссылка</div>
                </div>
              </div>
              <p className="text-ink-2-light dark:text-ink-2-dark text-[14.5px] leading-[1.55]">
                Скачайте файл, откройте в файловом менеджере. Первый раз Android спросит «разрешить установку из этого источника» - согласитесь.
              </p>
              <div className="flex gap-2 flex-wrap mt-auto">
                {apk ? (
                  <a
                    href={apk.apkUrl}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[14px] hover:opacity-90 transition-opacity"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 3v14m-6-6l6 6 6-6M4 21h16"/></svg>
                    Скачать APK · {apk.versionName}
                  </a>
                ) : (
                  <button
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[14px] opacity-50 cursor-not-allowed"
                    disabled
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 3v14m-6-6l6 6 6-6M4 21h16"/></svg>
                    Скоро - APK
                  </button>
                )}
                <Link to="/app" className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-transparent border border-line-light dark:border-line-dark font-semibold text-[14px]">
                  Открыть в браузере
                </Link>
              </div>
              <div className="text-[12px] text-ink-3-light dark:text-ink-3-dark">
                Пока APK не собран - работает как веб-приложение через «Добавить на главный экран».
              </div>
            </div>

            {/* iPhone */}
            <div className="bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark rounded-2xl p-6 md:p-8 flex flex-col gap-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-ink-light/8 dark:bg-white/8 grid place-items-center shrink-0 [background:rgba(0,0,0,.06)] dark:[background:rgba(255,255,255,.08)]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-ink-light dark:text-ink-dark">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                </div>
                <div className="leading-[1.15] min-w-0">
                  <div className="font-semibold text-[20px] -tracking-[.005em]">iPhone</div>
                  <div className="text-ink-3-light dark:text-ink-3-dark text-[13px] font-medium mt-0.5">Установка через Safari · без App Store</div>
                </div>
              </div>
              <ol className="text-ink-2-light dark:text-ink-2-dark text-[14.5px] leading-[1.55] space-y-2 pl-5 list-decimal">
                <li>Откройте сайт в <b className="text-ink-light dark:text-ink-dark">Safari</b> (не в Chrome)</li>
                <li>Нажмите «Поделиться» внизу</li>
                <li>Выберите «На экран Домой»</li>
                <li>Иконка появится рядом с остальными</li>
              </ol>
              <div className="flex gap-2 flex-wrap mt-auto">
                <Link to="/app" className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[14px]">
                  Открыть в Safari →
                </Link>
              </div>
              <div className="text-[12px] text-ink-3-light dark:text-ink-3-dark">
                Apple не разрешает ставить приложения вне App Store - это официальный способ.
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line-light dark:border-line-dark py-10 md:py-14 px-5 md:px-10">
        <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-[1.5fr_1fr] md:items-end">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <SchoolMark small />
              <div className="font-semibold text-[15px]">{shortName}</div>
            </div>
            <p className="text-ink-2-light dark:text-ink-2-dark text-[13.5px] leading-[1.55] max-w-md">
              {fullName}
            </p>
            <a
              href="mailto:schwf3xlr@mail.ru"
              className="inline-block mt-3 text-ink-2-light dark:text-ink-2-dark text-[13.5px] hover:text-ink-light dark:hover:text-ink-dark"
            >
              schwf3xlr@mail.ru
            </a>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 md:justify-end text-[13.5px] text-ink-2-light dark:text-ink-2-dark">
            <Link to="/app" className="hover:text-ink-light dark:hover:text-ink-dark">Открыть</Link>
            <a href="#features" className="hover:text-ink-light dark:hover:text-ink-dark">Возможности</a>
            <a href="#download" className="hover:text-ink-light dark:hover:text-ink-dark">Скачать</a>
            <Link to="/privacy" className="hover:text-ink-light dark:hover:text-ink-dark">Политика конфиденциальности</Link>
            <Link to="/terms" className="hover:text-ink-light dark:hover:text-ink-dark">Пользовательское соглашение</Link>
            <Link to="/admin" className="hover:text-ink-light dark:hover:text-ink-dark">Панель управления</Link>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-line-light dark:border-line-dark text-[12.5px] text-ink-3-light dark:text-ink-3-dark flex justify-between items-center flex-wrap gap-2">
          <span>© 2026 «Расписание СОШ №44»</span>
          <span>Расписание работает офлайн</span>
        </div>
      </footer>
    </div>
  );
}

function SchoolMark({ small = false }: { small?: boolean }) {
  return <SchoolLogo size={small ? 28 : 36} />;
}

const FEATURES = [
  {
    title: 'День и неделя',
    desc: 'Крупно - какой сейчас день, какая дата. Переключение между днями свайпом или тапом.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
  },
  {
    title: 'Идёт сейчас',
    desc: 'Показывает, какой урок идёт прямо сейчас и сколько минут до звонка.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  },
  {
    title: 'Дистант',
    desc: 'Если урок или весь день переведён на дистанционку - сразу видно синей меткой.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>,
  },
  {
    title: 'Тёмная тема',
    desc: 'Автоматически переключается по настройкам системы. Или руками - как удобно.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>,
  },
  {
    title: 'Группы',
    desc: 'Понимает деление на подгруппы - технология Д и М, английский, физкультура.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><circle cx="9" cy="10" r="4"/><path d="M17 11a3 3 0 100-6M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 14c2.8 0 5 2.2 5 5"/></svg>,
  },
  {
    title: 'Офлайн',
    desc: 'Последнее расписание сохраняется. В школе плохо ловит - всё равно работает.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M5 12.5a7 7 0 0114 0M2 9a10 10 0 0120 0M8.5 16a3.5 3.5 0 017 0M12 19.5v.01"/></svg>,
  },
];

function PhoneMockup() {
  const lessons = [
    { time: '8:30', end: '9:15', subj: 'Алгебра', room: '214', teacher: 'Иванова М.С.', state: 'done' as const },
    { time: '9:25', end: '10:10', subj: 'Русский язык', room: '108', teacher: 'Смирнова А.П.', state: 'now' as const },
    { time: '10:40', end: '11:25', subj: 'Литература', room: '108', teacher: 'Смирнова А.П.', state: 'next' as const },
    { time: '11:40', end: '12:25', subj: 'Физика', room: 'онлайн', teacher: 'Николаев В.И.', state: 'distant' as const },
    { time: '12:40', end: '13:25', subj: 'Информатика', room: '412', teacher: 'Петров Д.В.', state: 'next' as const },
  ];
  return (
    <div className="max-w-[340px] mx-auto relative bg-[#0a0a0b] rounded-[44px] p-2.5 shadow-2xl -rotate-1"
      style={{ boxShadow: '0 30px 80px -30px rgba(15,24,32,.35), 0 6px 12px -6px rgba(15,24,32,.1), inset 0 0 0 2px #26262a' }}>
      <div className="absolute top-[22px] left-1/2 -translate-x-1/2 w-[110px] h-[26px] bg-[#0a0a0b] rounded-2xl z-10" />
      <div className="bg-[#fafaf9] rounded-[33px] overflow-hidden h-[600px] pt-14 px-6 pb-5 text-[#0a0a0a]">
        <div className="flex items-center justify-between mb-3 text-[12px] text-[#6b6b6b] font-medium">
          <span>10А · СОШ №44</span>
          <span className="inline-flex items-center gap-1 text-[#3b7cbf]">
            <span className="w-1.5 h-1.5 bg-[#3b7cbf] rounded-full" />
            обновлено
          </span>
        </div>
        <h2 className="font-serif font-normal text-[38px] -tracking-[.02em] leading-none">Четверг</h2>
        <div className="flex items-center gap-2.5 mt-2.5 text-[14px] text-[#6b6b6b]">
          10 сентября
          <span className="inline-flex items-center gap-1.5 bg-[#ffe9dd] text-accent px-2 py-0.5 rounded-full text-[12px] font-semibold">
            <span className="w-1.5 h-1.5 bg-accent rounded-full" />
            сегодня
          </span>
        </div>
        <hr className="my-4 border-t border-[#ececec]" />
        {lessons.map(l => (
          <div key={l.time} className="grid grid-cols-[52px_3px_1fr] gap-3 py-3 border-b border-[#f4f4f3] last:border-b-0 items-center">
            <div className={`text-[13px] font-semibold tabular-nums ${l.state === 'done' ? 'text-[#a3a3a3]' : 'text-[#0a0a0a]'}`}>
              {l.time}
              <small className="block text-[#a3a3a3] font-medium text-[11px] mt-0.5">{l.end}</small>
            </div>
            <div className={`rounded-full self-stretch ${
              l.state === 'now' ? 'bg-accent' :
              l.state === 'distant' ? 'bg-[#3b7cbf]' :
              l.state === 'done' ? 'bg-[#f4f4f3]' : 'bg-[#ececec]'
            }`} />
            <div>
              <div className={`font-semibold text-[15px] leading-tight ${l.state === 'done' ? 'text-[#a3a3a3]' : ''}`}>
                {l.subj}
                {l.state === 'now' && <span className="inline-block bg-accent text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1.5 uppercase tracking-wider align-[2px]">Сейчас</span>}
                {l.state === 'distant' && <span className="inline-block bg-[#eaf1fa] text-[#3b7cbf] text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1.5 uppercase tracking-wider align-[2px]">Дистант</span>}
              </div>
              <div className="text-[#6b6b6b] text-[12px] mt-0.5 flex gap-1.5 items-center">
                {l.state === 'distant' ? (
                  <span className="text-[#3b7cbf] font-semibold">Онлайн</span>
                ) : (
                  <span className="bg-white border border-[#ececec] px-1.5 py-px rounded text-[11px] font-semibold text-[#0a0a0a]">{l.room}</span>
                )}
                <span>{l.teacher}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
