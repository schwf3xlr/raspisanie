import type { Lesson } from '../lib/types';
import { lessonStatus } from '../lib/time';

interface Props {
  lesson: Lesson;
  isToday: boolean;
  distantDay?: boolean;
  /** В учительском виде - не рисуем имя учителя (это же он сам), но показываем класс. */
  teacherMode?: boolean;
}

export default function LessonRow({ lesson, isToday, distantDay = false, teacherMode = false }: Props) {
  const st = lessonStatus(lesson.timeStart, lesson.timeEnd, isToday);
  const dim = st.status === 'done';
  const now = st.status === 'now';
  const distant = distantDay || !!lesson.distant;
  const changed = lesson.fromOverride;
  const timeMoved = !!lesson.timeOverridden;

  const barCls = now
    ? 'bg-accent dark:bg-accent-dark'
    : dim
      ? 'bg-line-2-light dark:bg-line-2-dark'
      : distant
        ? 'bg-distant dark:bg-distant-dark'
        : changed
          ? 'bg-accent/60 dark:bg-accent-dark/60'
          : 'bg-line-light dark:bg-line-dark';

  return (
    <div className="grid gap-4 md:gap-6 items-stretch py-4 md:py-5 grid-cols-[64px_3px_1fr] md:grid-cols-[100px_3px_1fr] border-t border-line-2-light dark:border-line-2-dark first:border-t-0">
      <div className={[
        'flex flex-col justify-between py-0.5 tabular-nums',
        timeMoved ? 'bg-yellow-100/80 dark:bg-yellow-900/30 rounded-lg px-1.5 -mx-1.5 ring-1 ring-yellow-400/50 dark:ring-yellow-600/40' : '',
      ].join(' ')}>
        <div className={['text-[15px] md:text-[20px] font-semibold -tracking-[.01em]',
          dim ? 'text-ink-3-light dark:text-ink-3-dark'
              : timeMoved ? 'text-yellow-800 dark:text-yellow-200'
              : 'text-ink-light dark:text-ink-dark'].join(' ')}>
          {lesson.timeStart}
        </div>
        <div className={['text-[12.5px] md:text-[13px] font-medium mt-auto md:mt-1.5',
          timeMoved ? 'text-yellow-700/80 dark:text-yellow-300/80'
                    : 'text-ink-3-light dark:text-ink-3-dark'].join(' ')}>
          {lesson.timeEnd}
        </div>
      </div>
      <div className={['rounded-full min-h-[44px]', barCls].join(' ')} />
      <div className="py-0.5 min-w-0">
        {lesson.groups.map((g, i) => (
          <div key={i} className={i > 0 ? 'mt-3 pt-3 border-t border-dashed border-line-light dark:border-line-dark' : ''}>
            <div className={['text-[17px] md:text-[20px] font-semibold -tracking-[.01em] leading-tight break-words', dim ? 'text-ink-3-light dark:text-ink-3-dark' : 'text-ink-light dark:text-ink-dark'].join(' ')}>
              {lesson.groups.length > 1 && (
                <span className="inline-block bg-accent-soft dark:bg-accent-soft-dark text-accent dark:text-accent-dark text-[10.5px] font-bold tracking-[.06em] uppercase px-1.5 py-0.5 rounded mr-2 align-[2px]">
                  Гр. {i + 1}
                </span>
              )}
              {g.subject}
              {now && i === 0 && (
                <span className="inline-block bg-accent dark:bg-accent-dark text-white text-[10.5px] font-bold tracking-[.06em] uppercase px-2 py-[3px] rounded-full ml-2.5 align-[3px]">
                  Сейчас
                </span>
              )}
              {distant && !now && i === 0 && (
                <span className="inline-flex items-center gap-1 bg-distant-soft dark:bg-distant-soft-dark text-distant dark:text-distant-dark text-[10.5px] font-bold tracking-[.06em] uppercase px-2 py-[3px] rounded-full ml-2.5 align-[3px]">
                  Дистант
                </span>
              )}
              {changed && !distant && !now && i === 0 && (
                <span className="inline-block bg-accent-soft dark:bg-accent-soft-dark text-accent dark:text-accent-dark text-[10.5px] font-bold tracking-[.06em] uppercase px-2 py-[3px] rounded-full ml-2.5 align-[3px]">
                  Замена
                </span>
              )}
              {timeMoved && !changed && !distant && !now && i === 0 && (
                <span className="inline-block bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 text-[10.5px] font-bold tracking-[.06em] uppercase px-2 py-[3px] rounded-full ml-2.5 align-[3px]">
                  Другое время
                </span>
              )}
            </div>
            <div className={['text-[13.5px] mt-1.5 flex gap-2.5 items-center flex-wrap', dim ? 'text-ink-3-light dark:text-ink-3-dark' : 'text-ink-2-light dark:text-ink-2-dark'].join(' ')}>
              {teacherMode && lesson.className && i === 0 && (
                <span className={['rounded-md px-1.5 py-px text-[12px] font-bold tabular-nums',
                  dim ? 'bg-line-2-light dark:bg-line-2-dark text-ink-3-light dark:text-ink-3-dark' : 'bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark'].join(' ')}>
                  {lesson.className}
                </span>
              )}
              {distant ? (
                <span className="text-distant dark:text-distant-dark font-semibold">Онлайн</span>
              ) : (
                g.room && (
                  <span className={['border rounded-md px-1.5 py-px text-[12px] font-semibold', dim ? 'text-ink-3-light dark:text-ink-3-dark border-line-2-light dark:border-line-2-dark' : 'text-ink-light dark:text-ink-dark border-line-light dark:border-line-dark bg-panel-light dark:bg-panel-dark'].join(' ')}>
                    {g.room}
                  </span>
                )
              )}
              {!teacherMode && g.teacher && <span>{g.teacher}</span>}
            </div>
          </div>
        ))}
        {now && st.progress != null && (
          <>
            <div className="h-0.5 bg-line-light dark:bg-line-dark rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-accent dark:bg-accent-dark rounded-full transition-[width] duration-500"
                style={{ width: `${Math.max(0, Math.min(100, st.progress * 100))}%` }} />
            </div>
            {st.minutesLeft != null && (
              <div className="text-[12px] text-accent dark:text-accent-dark font-semibold mt-1.5 tabular-nums">
                до звонка {st.minutesLeft} мин
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
