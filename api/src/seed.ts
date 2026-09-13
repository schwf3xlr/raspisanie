import { config, DEFAULT_TIME_SLOTS } from './config.js';
import { db } from './db.js';
import { toDbDate, toISODate, workdaysOfWeek } from './date-utils.js';
import type { GroupRef } from './types.js';

const CLASSES: Array<{ name: string; sortKey: number }> = [
  { name: '5А', sortKey: 501 }, { name: '5Б', sortKey: 502 },
  { name: '6А', sortKey: 601 }, { name: '6Б', sortKey: 602 },
  { name: '7А', sortKey: 701 }, { name: '7Б', sortKey: 702 },
  { name: '8А', sortKey: 801 }, { name: '8Б', sortKey: 802 },
  { name: '9А', sortKey: 901 }, { name: '9Б', sortKey: 902 },
  { name: '10А', sortKey: 1001 }, { name: '10Б', sortKey: 1002 },
  { name: '11А', sortKey: 1101 },
];

const TEACHERS: Array<{ fullName: string; shortName: string }> = [
  { fullName: 'Иванова Мария Сергеевна', shortName: 'Иванова М.С.' },
  { fullName: 'Смирнова Анна Павловна', shortName: 'Смирнова А.П.' },
  { fullName: 'Козлова Елена Михайловна', shortName: 'Козлова Е.М.' },
  { fullName: 'Николаев Виктор Иванович', shortName: 'Николаев В.И.' },
  { fullName: 'Соколова Ольга Игоревна', shortName: 'Соколова О.И.' },
  { fullName: 'Петров Дмитрий Викторович', shortName: 'Петров Д.В.' },
  { fullName: 'Волков Роман Александрович', shortName: 'Волков Р.А.' },
  { fullName: 'Белова Татьяна Николаевна', shortName: 'Белова Т.Н.' },
  { fullName: 'Морозов Александр Сергеевич', shortName: 'Морозов А.С.' },
  { fullName: 'Морозова Татьяна Александровна', shortName: 'Морозова Т.А.' },
  { fullName: 'Николаева Ирина Ивановна', shortName: 'Николаева И.И.' },
  { fullName: 'Панов Андрей Викторович', shortName: 'Панов А.В.' },
  { fullName: 'Егорова Людмила Николаевна', shortName: 'Егорова Л.Н.' },
  { fullName: 'Дроботун Людмила Николаевна', shortName: 'Дроботун Л.Н.' },
];

const SUBJECTS = [
  'Математика', 'Алгебра', 'Геометрия', 'Русский язык', 'Литература',
  'Английский язык', 'Физика', 'Химия', 'Биология', 'История',
  'Обществознание', 'География', 'Информатика', 'Астрономия', 'Экономика',
  'Окружающий мир', 'ИЗО', 'Музыка', 'ОБЖ', 'Физ.культура',
  'Технология Д', 'Технология М', 'Классный час',
];

const ROOMS: Array<{ name: string; kind: string }> = [
  { name: '108', kind: 'regular' }, { name: '115', kind: 'regular' },
  { name: '116', kind: 'regular' }, { name: '210', kind: 'regular' },
  { name: '214', kind: 'regular' }, { name: '220', kind: 'regular' },
  { name: '305', kind: 'lab' }, { name: '306', kind: 'regular' },
  { name: '311', kind: 'regular' }, { name: '402', kind: 'lab' },
  { name: '404', kind: 'lab' }, { name: '412', kind: 'lab' },
  { name: 'с/з', kind: 'gym' },
  { name: '101 кб.', kind: 'workshop' }, { name: '107а кб.', kind: 'workshop' },
];

type Parallel = '5-6' | '7-8' | '9' | '10-11';
function parallelFor(name: string): Parallel {
  const n = parseInt(name, 10);
  if (n <= 6) return '5-6';
  if (n <= 8) return '7-8';
  if (n === 9) return '9';
  return '10-11';
}

interface Combo { subject: string; teacher: string; room: string }
const BANK: Record<Parallel, Combo[]> = {
  '5-6': [
    { subject: 'Математика', teacher: 'Иванова М.С.', room: '214' },
    { subject: 'Русский язык', teacher: 'Смирнова А.П.', room: '108' },
    { subject: 'Литература', teacher: 'Смирнова А.П.', room: '108' },
    { subject: 'Английский язык', teacher: 'Козлова Е.М.', room: '220' },
    { subject: 'Окружающий мир', teacher: 'Соколова О.И.', room: '402' },
    { subject: 'ИЗО', teacher: 'Морозова Т.А.', room: '115' },
    { subject: 'Музыка', teacher: 'Николаева И.И.', room: '116' },
    { subject: 'Физ.культура', teacher: 'Панов А.В.', room: 'с/з' },
    { subject: 'История', teacher: 'Волков Р.А.', room: '311' },
  ],
  '7-8': [
    { subject: 'Алгебра', teacher: 'Иванова М.С.', room: '214' },
    { subject: 'Геометрия', teacher: 'Иванова М.С.', room: '214' },
    { subject: 'Русский язык', teacher: 'Смирнова А.П.', room: '108' },
    { subject: 'Литература', teacher: 'Смирнова А.П.', room: '108' },
    { subject: 'Английский язык', teacher: 'Козлова Е.М.', room: '220' },
    { subject: 'Физика', teacher: 'Николаев В.И.', room: '305' },
    { subject: 'Биология', teacher: 'Соколова О.И.', room: '402' },
    { subject: 'История', teacher: 'Волков Р.А.', room: '311' },
    { subject: 'География', teacher: 'Егорова Л.Н.', room: '306' },
    { subject: 'Информатика', teacher: 'Петров Д.В.', room: '412' },
    { subject: 'Физ.культура', teacher: 'Панов А.В.', room: 'с/з' },
  ],
  '9': [
    { subject: 'Алгебра', teacher: 'Иванова М.С.', room: '214' },
    { subject: 'Геометрия', teacher: 'Иванова М.С.', room: '214' },
    { subject: 'Русский язык', teacher: 'Смирнова А.П.', room: '108' },
    { subject: 'Литература', teacher: 'Смирнова А.П.', room: '108' },
    { subject: 'Английский язык', teacher: 'Козлова Е.М.', room: '220' },
    { subject: 'Физика', teacher: 'Николаев В.И.', room: '305' },
    { subject: 'Химия', teacher: 'Белова Т.Н.', room: '404' },
    { subject: 'Биология', teacher: 'Соколова О.И.', room: '402' },
    { subject: 'История', teacher: 'Волков Р.А.', room: '311' },
    { subject: 'Обществознание', teacher: 'Волков Р.А.', room: '311' },
    { subject: 'Информатика', teacher: 'Петров Д.В.', room: '412' },
    { subject: 'Физ.культура', teacher: 'Панов А.В.', room: 'с/з' },
    { subject: 'ОБЖ', teacher: 'Морозов А.С.', room: '210' },
  ],
  '10-11': [
    { subject: 'Алгебра', teacher: 'Иванова М.С.', room: '214' },
    { subject: 'Геометрия', teacher: 'Иванова М.С.', room: '214' },
    { subject: 'Русский язык', teacher: 'Смирнова А.П.', room: '108' },
    { subject: 'Литература', teacher: 'Смирнова А.П.', room: '108' },
    { subject: 'Английский язык', teacher: 'Козлова Е.М.', room: '220' },
    { subject: 'Физика', teacher: 'Николаев В.И.', room: '305' },
    { subject: 'Химия', teacher: 'Белова Т.Н.', room: '404' },
    { subject: 'Биология', teacher: 'Соколова О.И.', room: '402' },
    { subject: 'История', teacher: 'Волков Р.А.', room: '311' },
    { subject: 'Обществознание', teacher: 'Волков Р.А.', room: '311' },
    { subject: 'Информатика', teacher: 'Петров Д.В.', room: '412' },
    { subject: 'Астрономия', teacher: 'Николаев В.И.', room: '305' },
    { subject: 'Экономика', teacher: 'Волков Р.А.', room: '311' },
    { subject: 'Физ.культура', teacher: 'Панов А.В.', room: 'с/з' },
  ],
};

const DAY_LESSON_COUNT: Record<string, number> = {
  Понедельник: 6, Вторник: 6, Среда: 6, Четверг: 6, Пятница: 5,
};
const DAY_SEED: Record<string, number> = {
  Понедельник: 11, Вторник: 23, Среда: 37, Четверг: 53, Пятница: 71,
};

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
function pickForClassDay(cls: string, day: string): Combo[] {
  const bank = BANK[parallelFor(cls)];
  const count = DAY_LESSON_COUNT[day] ?? 6;
  const seed = hash(`${cls}|${day}`) + DAY_SEED[day];
  const picked: Combo[] = [];
  const used = new Set<number>();
  let step = 1;
  while (picked.length < count && used.size < bank.length) {
    const idx = (seed + step * 13 + used.size * 7) % bank.length;
    if (!used.has(idx)) { picked.push(bank[idx]!); used.add(idx); }
    step++;
  }
  return picked;
}

export async function seedIfEmpty(): Promise<{ seeded: boolean; classes: number; lessons: number }> {
  const [existingClasses, existingLessons] = await Promise.all([
    db.class.count(),
    db.lessonTemplate.count(),
  ]);
  if (existingClasses > 0 || existingLessons > 0) {
    return { seeded: false, classes: existingClasses, lessons: existingLessons };
  }

  // справочники
  await db.class.createMany({ data: CLASSES });
  await db.teacher.createMany({ data: TEACHERS });
  await db.subject.createMany({ data: SUBJECTS.map(name => ({ name })) });
  await db.room.createMany({ data: ROOMS });

  const teachers = await db.teacher.findMany();
  const subjects = await db.subject.findMany();
  const rooms = await db.room.findMany();
  const teacherByShort = new Map(teachers.map(t => [t.shortName, t.id] as const));
  const subjectByName = new Map(subjects.map(s => [s.name, s.id] as const));
  const roomByName = new Map(rooms.map(r => [r.name, r.id] as const));

  // звонки
  for (const day of config.days) {
    for (const s of DEFAULT_TIME_SLOTS) {
      await db.timeSlot.create({
        data: { day, number: s.number, timeStart: s.timeStart, timeEnd: s.timeEnd },
      });
    }
  }

  // шаблон
  let lessons = 0;
  for (const day of config.days) {
    const count = DAY_LESSON_COUNT[day] ?? 6;
    for (const c of CLASSES) {
      const combos = pickForClassDay(c.name, day);
      for (let i = 0; i < count; i++) {
        const cb = combos[i];
        if (!cb) continue;
        const slot = DEFAULT_TIME_SLOTS.find(x => x.number === i + 1)!;

        let groups: GroupRef[] = [{
          subjectId: subjectByName.get(cb.subject)!,
          teacherId: teacherByShort.get(cb.teacher) ?? null,
          roomId: roomByName.get(cb.room) ?? null,
        }];
        if (day === 'Среда' && parallelFor(c.name) === '7-8' && i === 4) {
          groups = [
            { subjectId: subjectByName.get('Технология Д')!, teacherId: teacherByShort.get('Дроботун Л.Н.') ?? null, roomId: roomByName.get('101 кб.') ?? null },
            { subjectId: subjectByName.get('Технология М')!, teacherId: teacherByShort.get('Панов А.В.') ?? null, roomId: roomByName.get('107а кб.') ?? null },
          ];
        }
        await db.lessonTemplate.create({
          data: {
            day,
            className: c.name,
            number: i + 1,
            timeStart: slot.timeStart,
            timeEnd: slot.timeEnd,
            groups: groups as unknown as object,
          },
        });
        lessons++;
      }
    }
  }

  // публикуем текущую рабочую неделю, чтобы ученики что-то видели
  const today = new Date();
  for (const d of workdaysOfWeek(today)) {
    await db.publishedDay.create({ data: { date: toDbDate(toISODate(d)) } });
  }

  return { seeded: true, classes: CLASSES.length, lessons };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  seedIfEmpty()
    .then(r => {
      console.log(r.seeded ? `Seeded: ${r.classes} classes, ${r.lessons} lessons` : `Already has data: ${r.classes} classes, ${r.lessons} lessons`);
      return db.$disconnect();
    })
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
