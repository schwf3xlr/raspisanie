export interface Group {
  subject: string;
  teacher: string;
  room: string;
  subjectId: number;
  teacherId: number | null;
  roomId: number | null;
}

export interface Lesson {
  number: number;
  timeStart: string;
  timeEnd: string;
  groups: Group[];
  fromOverride: boolean;
  isCancelled: boolean;
  distant: { lessonLevel: boolean; note: string | null } | null;
  // В учительском виде - класс, где идёт этот урок.
  className?: string;
}

export interface Teacher {
  id: number;
  fullName: string;
  shortName: string;
}

export type ViewMode = 'class' | 'teacher';
export interface SavedViewer {
  mode: ViewMode;
  className?: string;
  teacherId?: number;
  teacherName?: string;
}

export interface Day {
  date: string;
  day: string | null;
  published: boolean;
  isToday: boolean;
  isDistantAllDay: boolean;
  distantAllDayNote: string | null;
  lessons: Lesson[];
}

export interface Week {
  className?: string;
  teacherId?: number;
  teacherName?: string;
  weekStart: string;
  weekEnd: string;
  days: Day[];
}

export const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'] as const;
export type DayName = typeof DAYS[number];

export const DAY_SHORT: Record<DayName, string> = {
  Понедельник: 'Пн',
  Вторник: 'Вт',
  Среда: 'Ср',
  Четверг: 'Чт',
  Пятница: 'Пт',
};

export interface School {
  short: string;
  full: string;
  city: string;
}
