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
  // true - override реально меняет состав (предмет / учитель / кабинет).
  // НЕ считается заменой ситуация, когда сдвинули только время звонков.
  fromOverride: boolean;
  // true - время урока отличается от стандартного расписания звонков.
  timeOverridden: boolean;
  isCancelled: boolean;
  distant: { lessonLevel: boolean; note: string | null } | null;
  // Только для учительского вида - в каком классе учитель ведёт этот урок.
  className?: string;
}

export interface BellChangeDTO {
  number: number;
  timeStart: string;    // фактическое время на эту дату
  timeEnd: string;
  standardStart: string;// стандартное время из шаблона звонков
  standardEnd: string;
}

export interface DayDTO {
  date: string;
  day: string | null;
  published: boolean;
  isToday: boolean;
  isDistantAllDay: boolean;
  distantAllDayNote: string | null;
  lessons: LessonDTO[];
  // Список номеров уроков, у которых на этот день сдвинуты звонки.
  bellChanges: BellChangeDTO[];
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
