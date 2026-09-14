export interface GroupRef {
  subjectId: number;
  teacherId: number | null;
  roomId: number | null;
}

export interface GroupResolved {
  subject: string;
  teacher: string;
  room: string;
  subjectId: number;
  teacherId: number | null;
  roomId: number | null;
}

export interface LessonDTO {
  number: number;
  timeStart: string;
  timeEnd: string;
  groups: GroupResolved[];
  fromOverride: boolean;
  isCancelled: boolean;
  distant: { lessonLevel: boolean; note: string | null } | null;
  // Только для учительского вида — в каком классе учитель ведёт этот урок.
  className?: string;
}

export interface DayDTO {
  date: string;
  day: string | null;
  published: boolean;
  isToday: boolean;
  isDistantAllDay: boolean;
  distantAllDayNote: string | null;
  lessons: LessonDTO[];
}

export interface WeekResponse {
  className?: string;
  teacherId?: number;
  teacherName?: string;
  weekStart: string;
  weekEnd: string;
  days: DayDTO[];
}

export interface DictionaryItem {
  id: number;
  name: string;
  shortName?: string;
  kind?: string;
}
