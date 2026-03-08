/**
 * devDataGenerator.ts — Comprehensive stress-test data generator for DevTools.
 *
 * Produces a much larger, more varied dataset than the base generateTestData():
 * - 25 teachers (incl. PER_EVENT and ONE_OFF rates, one archived)
 * - 7 activities spanning all ActivityType values (INSTRUCTIONAL / OPERATIONAL)
 * - 300 events: recurring series, add-on items, 6 deliberate room conflicts,
 *   events spanning ±90 days, future events for date-jump testing
 * - 12 students with assignments
 * - 15 Gantt blocks including BLACKOUT blocks
 * - Full chart, hours-report, inbox, and subscription seeds
 */

import {
  Teacher, CalendarEvent, Room, GanttBlock, Activity, Student, Guardian,
  AdminInboxItem, HoursReport, HoursEntry, CalendarSubscription,
  PositionAssignment, RateType, Subcategory, AddOnItem,
  StudentAssignment, PedagogicalRecord, TeachingAssignment,
} from '../types';
import { COLORS } from '../constants';
import { ChartConfiguration } from '../types/chartBuilder';

// ─── helpers ──────────────────────────────────────────────────────────────────

const rng = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const uid = () => Math.random().toString(36).slice(2, 11);

const addDays = (base: Date, n: number): Date => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
};

const timeStr = (base: Date, hour: number, minute: number): string => {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

// ─── name pools ───────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Noa', 'Lior', 'Yael', 'Omer', 'Tamar', 'Amir', 'Shira', 'Eitan',
  'Abdulrahman', 'Fatima', 'Sofia', 'Lucas', 'Chloe', 'Ethan',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Cohen', 'Levy', 'Mizrahi', 'Goldberg', 'Shapira', 'Friedman',
  'Chen', 'Al-Hashem', 'Van der Berg', 'Rosenberg', 'Katz', 'Schwartz',
];

const POSITIONS: { name: string; categories: string[]; hourlyRange: [number, number] }[] = [
  { name: 'Piano Instructor', categories: ['Individual Lesson'], hourlyRange: [100, 280] },
  { name: 'Voice Coach', categories: ['Individual Lesson'], hourlyRange: [90, 240] },
  { name: 'Violin Teacher', categories: ['Individual Lesson'], hourlyRange: [110, 260] },
  { name: 'Guitar Teacher', categories: ['Individual Lesson'], hourlyRange: [80, 210] },
  { name: 'Drum Instructor', categories: ['Individual Lesson'], hourlyRange: [85, 200] },
  { name: 'Cello Teacher', categories: ['Individual Lesson'], hourlyRange: [120, 280] },
  { name: 'Choir Director', categories: ['Group Lesson'], hourlyRange: [120, 320] },
  { name: 'Theory Teacher', categories: ['Group Lesson', 'Individual Lesson'], hourlyRange: [70, 160] },
  { name: 'Ensemble Coach', categories: ['Group Lesson'], hourlyRange: [110, 250] },
  { name: 'Orchestra Conductor', categories: ['Group Lesson'], hourlyRange: [150, 380] },
  { name: 'Admin Coordinator', categories: ['Administrative'], hourlyRange: [60, 130] },
  { name: 'Program Director', categories: ['Administrative'], hourlyRange: [80, 160] },
  { name: 'Oud Teacher', categories: ['Individual Lesson'], hourlyRange: [90, 210] },
  { name: 'Harp Teacher', categories: ['Individual Lesson'], hourlyRange: [130, 300] },
  { name: 'Composition Tutor', categories: ['Individual Lesson'], hourlyRange: [100, 240] },
];

const TAGS = [
  'Piano Dept', 'Strings Dept', 'Vocal Dept', 'Winds Dept', 'Percussion Dept',
  'Senior Staff', 'Junior Staff', 'Part-Time', 'Full-Time', 'Guest Artist', 'Contractor',
  'Jazz Faculty', 'Classical Faculty', 'Early Childhood', 'Youth Program', 'Adult Program',
  'Weekend Teacher', 'Evening Teacher', 'Competition Coach', 'Honors Program',
];

// ─── 1. Teachers ──────────────────────────────────────────────────────────────

export const generateDevTeachers = (currencySymbol = '₪'): Teacher[] => {
  const teachers: Teacher[] = [];
  const usedNames = new Set<string>();

  for (let i = 1; i <= 25; i++) {
    let fullName = '';
    let attempts = 0;
    do {
      fullName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      attempts++;
    } while (usedNames.has(fullName) && attempts < 50);
    usedNames.add(fullName);

    const posCount = Math.random() < 0.25 ? 1 : Math.random() < 0.65 ? 2 : 3;
    const shuffled = [...POSITIONS].sort(() => Math.random() - 0.5).slice(0, posCount);

    const positionAssignments: PositionAssignment[] = shuffled.map((pos, idx) => {
      const rateTypes: RateType[] = ['HOURLY', 'HOURLY', 'HOURLY', 'GLOBAL_MONTHLY', 'PER_EVENT'];
      const rateType: RateType = i === 25 ? 'ONE_OFF' : pick(rateTypes);
      const rateValue =
        rateType === 'HOURLY' ? rng(pos.hourlyRange[0], pos.hourlyRange[1]) :
        rateType === 'GLOBAL_MONTHLY' ? rng(2, 8) * 1000 :
        rateType === 'PER_EVENT' ? rng(150, 400) :
        rng(500, 3000);

      return {
        id: `T${i}_PA${idx}`,
        positionName: pos.name,
        category: pick(pos.categories),
        rateType,
        rateValue,
      };
    });

    const tags = [...TAGS].sort(() => Math.random() - 0.5).slice(0, rng(1, 4));

    const teacher: Teacher = {
      id: `T${i}`,
      fullName,
      positions: positionAssignments.map(pa => pa.positionName),
      positionAssignments,
      tags,
      phone: `555-${rng(100, 999)}-${rng(1000, 9999)}`,
      email: `${fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@music.school`,
      color: COLORS[(i - 1) % COLORS.length],
      ...(i === 25 ? { isArchived: true } : {}),
    };
    teachers.push(teacher);
  }

  // Add credentials and notes for first few teachers
  if (teachers[0]) {
    teachers[0].credentials = [
      { id: uid(), institution: 'Berklee College of Music', qualificationType: 'BM Music Performance', year: 2015 },
    ];
    teachers[0].notes = [{
      id: uid(),
      content: 'Prefers morning slots. Available for substitute teaching.',
      createdAt: new Date().toISOString(),
      createdBy: 'admin',
    }];
  }
  if (teachers[2]) {
    teachers[2].googleCalendarSyncEnabled = true;
    teachers[2].googleCalendarId = 'teacher3@group.calendar.google.com';
  }

  return teachers;
};

// ─── 1b. Link Teachers → Activities (post-processing) ────────────────────────

/**
 * Assigns each non-archived teacher 1-2 teaching assignments linked to real
 * activities and subcategories. Must be called AFTER both teachers and
 * activities have been generated. IDs are deterministic: `TA_T{i}_ACT{j}`.
 */
export const linkTeachersToActivities = (teachers: Teacher[], activities: Activity[]): void => {
  const activeActivities = activities.filter(a => !a.isArchived);
  if (activeActivities.length === 0) return;

  teachers.forEach((teacher, tIdx) => {
    if (teacher.isArchived) return;

    // Assign 1-2 activities per teacher via round-robin
    const count = tIdx % 3 === 0 ? 2 : 1;
    const tas: TeachingAssignment[] = [];

    for (let n = 0; n < count; n++) {
      const act = activeActivities[(tIdx + n) % activeActivities.length];
      const sub = act.subcategories?.[0];
      if (!sub) continue;

      tas.push({
        id: `TA_${teacher.id}_${act.id}`,
        activityId: act.id,
        subcategoryId: sub.id,
        startDate: addDays(new Date(), -rng(30, 365)).toISOString().slice(0, 10),
        isEnsemble: act.type === 'INSTRUCTIONAL' && act.name.toLowerCase().includes('ensemble'),
        isArchived: false,
      });
    }

    teacher.teachingAssignments = tas;
  });
};

// ─── 2. Rooms ─────────────────────────────────────────────────────────────────

export const generateDevRooms = (): Room[] => [
  { id: 'R1', name: 'Studio A', itinerary: 'Piano studio, Steinway grand' },
  { id: 'R2', name: 'Studio B', itinerary: 'Upright piano, mirrors' },
  { id: 'R3', name: 'Practice Room 1', itinerary: 'Small room, digital piano' },
  { id: 'R4', name: 'Practice Room 2', itinerary: 'Small room, guitar amps' },
  { id: 'R5', name: 'Ensemble Hall', itinerary: 'Large hall, 80 seats, full PA' },
  { id: 'R6', name: 'Theory Classroom', itinerary: 'Whiteboard, 20 student desks' },
  { id: 'R7', name: 'Recording Studio', itinerary: 'SSL console, isolation booth' },
  { id: 'R8', name: 'Dance/Movement Studio', itinerary: 'Sprung floor, mirrors, barre' },
];

// ─── 3. Activities ────────────────────────────────────────────────────────────

export const generateDevActivities = (): Activity[] => {
  const now = new Date().toISOString();

  const makeSub = (name: string): Subcategory => ({
    id: uid(), name, isArchived: false,
  });

  return [
    {
      id: 'ACT1', orgId: '', name: 'Piano Program', type: 'INSTRUCTIONAL',
      isArchived: false, createdAt: now, updatedAt: now,
      subcategories: [makeSub('Beginner'), makeSub('Intermediate'), makeSub('Advanced'), makeSub('ABRSM Prep')],
    },
    {
      id: 'ACT2', orgId: '', name: 'Vocal Studies', type: 'INSTRUCTIONAL',
      isArchived: false, createdAt: now, updatedAt: now,
      subcategories: [makeSub('Classical Voice'), makeSub('Contemporary Voice'), makeSub('Musical Theatre')],
    },
    {
      id: 'ACT3', orgId: '', name: 'Strings Ensemble', type: 'INSTRUCTIONAL',
      isArchived: false, createdAt: now, updatedAt: now,
      subcategories: [makeSub('Junior Strings'), makeSub('Senior Orchestra'), makeSub('Chamber Quartet')],
    },
    {
      id: 'ACT4', orgId: '', name: 'Music Theory & Ear Training', type: 'INSTRUCTIONAL',
      isArchived: false, createdAt: now, updatedAt: now,
      subcategories: [makeSub('Grade 1-3'), makeSub('Grade 4-6'), makeSub('Grade 7-8')],
    },
    {
      id: 'ACT5', orgId: '', name: 'Summer Recital Program', type: 'OPERATIONAL',
      isArchived: false, createdAt: now, updatedAt: now,
      subcategories: [makeSub('Junior Recital'), makeSub('Senior Recital'), makeSub('Showcase Night')],
    },
    {
      id: 'ACT6', orgId: '', name: 'Adult Community Choir', type: 'INSTRUCTIONAL',
      isArchived: false, createdAt: now, updatedAt: now,
      subcategories: [makeSub('Monday Evening'), makeSub('Thursday Morning')],
    },
    {
      // Archived activity — tests filtering/display behavior
      id: 'ACT7', orgId: '', name: 'Discontinued Jazz Workshop', type: 'INSTRUCTIONAL',
      isArchived: true, createdAt: now, updatedAt: now,
      subcategories: [],
    },
  ];
};

// ─── 4. Events ────────────────────────────────────────────────────────────────

const ACTIVITY_IDS = ['ACT1', 'ACT2', 'ACT3', 'ACT4', 'ACT5', 'ACT6'];
const STUDENT_NAMES_POOL = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank',
  'Ivy', 'Jake', 'Kim', 'Leo', 'Maya', 'Nate', 'Olivia', 'Pete',
];

export const generateDevCalendar = (
  teachers: Teacher[],
  rooms: Room[],
  currencySymbol = '₪',
  referenceDate?: Date,
): CalendarEvent[] => {
  const events: CalendarEvent[] = [];
  const today = referenceDate ? new Date(referenceDate) : new Date();
  today.setHours(0, 0, 0, 0);

  const DURATIONS = [30, 45, 60, 90, 120];

  const makeEvent = (
    dayOffset: number,
    startHour: number,
    startMin: number,
    durationMin: number,
    teacher: Teacher,
    room: Room,
    activityId?: string,
    overrides?: Partial<CalendarEvent>,
  ): CalendarEvent => {
    const date = addDays(today, dayOffset);
    const startStr = timeStr(date, startHour, startMin);
    const endDate = new Date(startStr);
    endDate.setMinutes(endDate.getMinutes() + durationMin);
    const studentName = pick(STUDENT_NAMES_POOL);
    const pa = teacher.positionAssignments?.[0];

    return {
      id: uid(),
      name: `${pa?.positionName ?? 'Lesson'} — ${studentName}`,
      description: '',
      start: startStr,
      end: endDate.toISOString(),
      teacherId: teacher.id,
      roomId: room.id,
      positionId: pa?.id,
      classification: pick(['Individual Lesson', 'Group Lesson', 'Other']),
      activityId: activityId ?? pick(ACTIVITY_IDS),
      isCanceled: false,
      isHidden: false,
      ...overrides,
    };
  };

  // ── A. Regular spread events ±90 days ──────────────────────────────────────
  for (let i = 0; i < 220; i++) {
    const teacher = teachers[i % teachers.length];
    const room = rooms[i % rooms.length];
    const dayOffset = rng(-90, 90);
    const startHour = rng(8, 20);
    const startMin = pick([0, 15, 30, 45]);
    const duration = pick(DURATIONS);
    const isCanceled = Math.random() < 0.08;
    const hasAddOns = Math.random() < 0.12;
    const hasRateOverride = Math.random() < 0.10;

    const addOnItems: AddOnItem[] | undefined = hasAddOns ? [
      { id: uid(), label: 'Music Sheet Pack', amount: rng(20, 80), affectsPayroll: false },
      ...(Math.random() > 0.5 ? [{ id: uid(), label: 'Recording Fee', amount: rng(50, 150), affectsPayroll: true }] : []),
    ] : undefined;

    events.push(makeEvent(dayOffset, startHour, startMin, duration, teacher, room, pick(ACTIVITY_IDS), {
      isCanceled,
      cancellationPayStatus: isCanceled ? (Math.random() > 0.5 ? 'PAID_CANCELLATION' : 'NO_PAY_CANCELLATION') : undefined,
      ...(addOnItems ? { addOnItems } : {}),
      ...(hasRateOverride ? {
        overrideFlags: { isRateOverridden: true },
        overrideReason: 'Student discount applied',
      } : {}),
    }));
  }

  // ── B. Recurring weekly series (same teacher, same room, Mondays) ──────────
  const recurringTeacher = teachers[0];
  const recurringRoom = rooms[0];
  for (let week = -8; week <= 12; week++) {
    events.push(makeEvent(week * 7, 10, 0, 60, recurringTeacher, recurringRoom, 'ACT1', {
      name: 'Weekly Piano — Alice (recurring)',
      description: 'Recurring weekly lesson',
      recurrenceId: 'RECUR_PIANO_ALICE',
    }));
  }

  // ── C. Bi-weekly choir rehearsal series ──────────────────────────────────
  const choirTeacher = teachers[6 % teachers.length];
  const ensembleRoom = rooms[4] ?? rooms[0];
  for (let i = 0; i < 10; i++) {
    events.push(makeEvent(-28 + i * 14, 18, 0, 120, choirTeacher, ensembleRoom, 'ACT6', {
      name: 'Community Choir Rehearsal (bi-weekly)',
      classification: 'Group Lesson',
    }));
  }

  // ── D. Deliberate room conflicts (6 pairs) ───────────────────────────────
  const conflictRoom = rooms[1] ?? rooms[0];
  for (let pair = 0; pair < 6; pair++) {
    const dayOffset = rng(-14, 14);
    const conflictHour = rng(10, 16);
    const teacherA = teachers[(pair * 2) % teachers.length];
    const teacherB = teachers[(pair * 2 + 1) % teachers.length];
    events.push(makeEvent(dayOffset, conflictHour, 0, 60, teacherA, conflictRoom, undefined, {
      name: `[CONFLICT A-${pair + 1}] ${teacherA.fullName}`,
    }));
    events.push(makeEvent(dayOffset, conflictHour, 30, 60, teacherB, conflictRoom, undefined, {
      name: `[CONFLICT B-${pair + 1}] ${teacherB.fullName}`,
    }));
  }

  // ── E. Future events for date-jump testing (3–6 months out) ──────────────
  for (let i = 0; i < 30; i++) {
    const teacher = teachers[i % teachers.length];
    const room = rooms[i % rooms.length];
    events.push(makeEvent(rng(90, 180), rng(9, 18), pick([0, 30]), pick(DURATIONS), teacher, room, pick(ACTIVITY_IDS), {
      name: `Future ${teacher.positionAssignments?.[0]?.positionName ?? 'Lesson'} — ${pick(STUDENT_NAMES_POOL)}`,
    }));
  }

  return events;
};

// ─── 5. Gantt Blocks ──────────────────────────────────────────────────────────

export const generateDevGantts = (teachers: Teacher[], referenceDate?: Date): GanttBlock[] => {
  const today = referenceDate ? new Date(referenceDate) : new Date();
  today.setHours(0, 0, 0, 0);

  const blocks: GanttBlock[] = [];

  const assignmentData = [
    { teacherIdx: 0, label: 'Piano Program — Full Term', dayStart: -30, dayEnd: 90, color: '#3b82f6' },
    { teacherIdx: 1, label: 'Vocal Studies — Semester 1', dayStart: -60, dayEnd: 30, color: '#8b5cf6' },
    { teacherIdx: 2, label: 'Strings Ensemble — Year Contract', dayStart: -14, dayEnd: 180, color: '#10b981' },
    { teacherIdx: 3, label: 'Theory Classes — Q1', dayStart: 0, dayEnd: 60, color: '#f59e0b' },
    { teacherIdx: 4, label: 'Drum Clinic — Spring', dayStart: 7, dayEnd: 45, color: '#ef4444' },
    { teacherIdx: 5, label: 'Choir Season', dayStart: -21, dayEnd: 120, color: '#ec4899' },
    { teacherIdx: 6, label: 'Composition Workshop', dayStart: 14, dayEnd: 70, color: '#06b6d4' },
    { teacherIdx: 7, label: 'Guitar Program — Adult', dayStart: -7, dayEnd: 90, color: '#84cc16' },
    { teacherIdx: 8, label: 'Harp Intensive', dayStart: 30, dayEnd: 60, color: '#f97316' },
    { teacherIdx: 9, label: 'Oud Workshop — Spring Term', dayStart: -14, dayEnd: 100, color: '#14b8a6' },
    { teacherIdx: 10, label: 'Orchestra Season — Full Year', dayStart: -90, dayEnd: 90, color: '#6366f1' },
    { teacherIdx: 11, label: 'Music Therapy Program', dayStart: 0, dayEnd: 120, color: '#a855f7' },
  ];

  assignmentData.forEach((asgn, idx) => {
    blocks.push({
      id: `G${idx + 1}`,
      title: asgn.label,
      startDate: addDays(today, asgn.dayStart).toISOString().slice(0, 10),
      endDate: addDays(today, asgn.dayEnd).toISOString().slice(0, 10),
      color: asgn.color,
      isBlackout: false,
    });
  });

  // Blackout blocks (facility closures / holidays)
  const blackouts = [
    { label: 'School Closed — Passover', dayStart: 14, dayEnd: 21, color: '#94a3b8' },
    { label: 'Summer Break', dayStart: 75, dayEnd: 105, color: '#94a3b8' },
    { label: 'Equipment Maintenance', dayStart: -3, dayEnd: -1, color: '#f87171' },
  ];

  blackouts.forEach((b, idx) => {
    blocks.push({
      id: `GB${idx + 1}`,
      title: b.label,
      startDate: addDays(today, b.dayStart).toISOString().slice(0, 10),
      endDate: addDays(today, b.dayEnd).toISOString().slice(0, 10),
      color: b.color,
      isBlackout: true,
    });
  });

  return blocks;
};

// ─── 6. Students ──────────────────────────────────────────────────────────────

const emptyPedagogicalRecord = (): PedagogicalRecord => ({
  lessonHistory: [],
  recitalHistory: [],
  reportCards: [],
});

export const generateDevStudents = (teachers: Teacher[], activities: Activity[]): Student[] => {
  const now = new Date();
  const nowIso = now.toISOString();

  const studentDefs = [
    { name: 'Alice Goldberg', dob: '2012-03-15', isMinor: true, actIdxs: [0, 3] },
    { name: 'Bob Chen', dob: '2010-07-22', isMinor: true, actIdxs: [0] },
    { name: 'Charlie Levy', dob: '2014-11-08', isMinor: true, actIdxs: [1, 3] },
    { name: 'Diana Smith', dob: '2015-01-30', isMinor: true, actIdxs: [0, 1] },
    { name: 'Eve Johnson', dob: '2009-09-05', isMinor: true, actIdxs: [2, 3] },
    { name: 'Frank Garcia', dob: '2016-06-14', isMinor: true, actIdxs: [0] },
    { name: 'Grace Williams', dob: '2008-12-20', isMinor: true, actIdxs: [1, 2] },
    { name: 'Hank Brown', dob: '2013-04-11', isMinor: true, actIdxs: [0, 3] },
    { name: 'Ivy Cohen', dob: '1985-08-17', isMinor: false, actIdxs: [5] },
    { name: 'Jake Martinez', dob: '1992-02-28', isMinor: false, actIdxs: [0, 5] },
    { name: 'Kim Rosenberg', dob: '1978-10-03', isMinor: false, actIdxs: [4] },
    { name: 'Leo Al-Hashem', dob: '2017-05-19', isMinor: true, actIdxs: [0] },
  ];

  return studentDefs.map((def, i) => {
    const acts = def.actIdxs.map(idx => activities[idx]).filter(Boolean);
    const guardian: Guardian | undefined = def.isMinor ? {
      id: uid(),
      fullName: `Parent of ${def.name.split(' ')[0]}`,
      phone: `055-${rng(100, 999)}-${rng(1000, 9999)}`,
      email: `parent.${def.name.split(' ')[0].toLowerCase()}@email.com`,
      relationship: pick(['Mother', 'Father', 'Guardian']),
    } : undefined;

    const assignments: StudentAssignment[] = acts.map(act => {
      // Find a teacher who has a teaching assignment for this activity
      const teacherForAct = teachers.find(t => t.teachingAssignments?.some(ta => ta.activityId === act.id));
      const taForAct = teacherForAct?.teachingAssignments?.find(ta => ta.activityId === act.id);
      return {
        id: uid(),
        activityId: act.id,
        subcategoryId: taForAct?.subcategoryId ?? act.subcategories?.[0]?.id ?? uid(),
        staffMemberId: teacherForAct?.id ?? teachers[i % teachers.length]?.id ?? 'T1',
        teachingAssignmentId: taForAct?.id ?? uid(),
        startDate: addDays(now, -rng(30, 365)).toISOString().slice(0, 10),
        status: 'ACTIVE' as const,
      };
    });

    const student: Student = {
      id: `S${i + 1}`,
      orgId: '',
      fullName: def.name,
      dateOfBirth: def.dob,
      isMinor: def.isMinor,
      guardians: guardian ? [guardian] : [],
      assignments,
      pedagogicalRecord: emptyPedagogicalRecord(),
      notes: [],
      documents: [],
      profileStatus: i === 10 ? 'ARCHIVED' : 'ACTIVE',
      createdAt: nowIso,
      updatedAt: nowIso,
      ...(def.isMinor ? {} : {
        phone: `054-${rng(100, 999)}-${rng(1000, 9999)}`,
        email: `${def.name.split(' ')[0].toLowerCase()}@email.com`,
      }),
    };

    return student;
  });
};

// ─── 7. Admin Inbox ───────────────────────────────────────────────────────────

export const generateDevInbox = (teachers: Teacher[], students: Student[]): AdminInboxItem[] => {
  const now = new Date();
  return [
    {
      id: uid(), orgId: '', type: 'TASK', status: 'OPEN',
      title: `Review hours report — ${teachers[0]?.fullName ?? 'Teacher 1'}`,
      message: 'Monthly hours report has been submitted and requires admin review before payroll closes.',
      relatedEntityType: 'TEACHER', relatedEntityIds: [teachers[0]?.id ?? 'T1'],
      createdAt: addDays(now, -5).toISOString(),
    },
    {
      id: uid(), orgId: '', type: 'TASK', status: 'OPEN',
      title: `Missing enrollment form — ${students[2]?.fullName ?? 'Student 3'}`,
      message: 'Student enrolled 30 days ago but physical enrollment form has not been received.',
      relatedEntityType: 'STUDENT', relatedEntityIds: [students[2]?.id ?? 'S3'],
      createdAt: addDays(now, -3).toISOString(),
    },
    {
      id: uid(), orgId: '', type: 'TASK', status: 'OPEN',
      title: `Contract renewal due — ${teachers[4]?.fullName ?? 'Teacher 5'}`,
      message: 'Teaching contract expires in 14 days. Initiate renewal process.',
      relatedEntityType: 'TEACHER', relatedEntityIds: [teachers[4]?.id ?? 'T5'],
      createdAt: addDays(now, -1).toISOString(),
    },
    {
      id: uid(), orgId: '', type: 'TASK', status: 'DONE',
      title: 'Updated rate schedule — Piano Program',
      message: 'Rate adjustments applied for new semester. Verified against activity settings.',
      relatedEntityType: 'TEACHER', relatedEntityIds: [],
      createdAt: addDays(now, -14).toISOString(),
    },
    {
      id: uid(), orgId: '', type: 'NOTIFICATION', status: 'OPEN',
      title: 'Archived teacher has future events',
      message: teachers[24]
        ? `${teachers[24].fullName} is archived but appears on future calendar events. Reassign or remove.`
        : 'An archived teacher still appears on future calendar events.',
      relatedEntityType: 'TEACHER', relatedEntityIds: [teachers[24]?.id ?? 'T25'],
      createdAt: addDays(now, -2).toISOString(),
    },
  ] as AdminInboxItem[];
};

// ─── 8. Hours Reports ────────────────────────────────────────────────────────

export const generateDevHoursReports = (teachers: Teacher[]): HoursReport[] => {
  const t1 = teachers[0];
  const t2 = teachers[1];
  const t3 = teachers[2];
  if (!t1 || !t2) return [];
  const now = new Date();

  const makeEntry = (date: Date, description: string, hours: number): HoursEntry => ({
    id: uid(),
    date: date.toISOString().slice(0, 10),
    description,
    hours,
    entryType: 'MANUAL',
  });

  const periodStart1 = addDays(now, -30).toISOString().slice(0, 10);
  const periodEnd1 = addDays(now, -1).toISOString().slice(0, 10);
  const periodStart2 = addDays(now, -60).toISOString().slice(0, 10);
  const periodEnd2 = addDays(now, -31).toISOString().slice(0, 10);

  const reports: HoursReport[] = [
    {
      id: uid(), orgId: '', staffMemberId: t1.id, token: uid(),
      periodStart: periodStart1, periodEnd: periodEnd1,
      status: 'PENDING', createdBy: 'admin', createdAt: addDays(now, -3).toISOString(),
    },
    {
      id: uid(), orgId: '', staffMemberId: t2.id, token: uid(),
      periodStart: periodStart2, periodEnd: periodEnd2,
      status: 'SUBMITTED',
      submittedAt: addDays(now, -5).toISOString(),
      reportedEntries: [
        makeEntry(addDays(now, -55), 'Piano lessons', 8),
        makeEntry(addDays(now, -48), 'Theory group', 4),
        makeEntry(addDays(now, -40), 'Substitute coverage', 2),
      ],
      createdBy: 'admin', createdAt: addDays(now, -10).toISOString(),
    },
  ];

  if (t3) {
    const periodStart3 = addDays(now, -90).toISOString().slice(0, 10);
    const periodEnd3 = addDays(now, -61).toISOString().slice(0, 10);
    reports.push({
      id: uid(), orgId: '', staffMemberId: t3.id, token: uid(),
      periodStart: periodStart3, periodEnd: periodEnd3,
      status: 'REVIEWED',
      submittedAt: addDays(now, -80).toISOString(),
      reportedEntries: [makeEntry(addDays(now, -85), 'Strings ensemble', 12)],
      createdBy: 'admin', createdAt: addDays(now, -90).toISOString(),
    });
  }

  return reports;
};

// ─── 9. Saved Charts ─────────────────────────────────────────────────────────

export const generateDevCharts = (): ChartConfiguration[] => [
  {
    id: uid(), title: 'Cost by Teacher (Top 10)', type: 'bar',
    xAxis: 'teacher', yAxis: 'totalCost', filters: {}, colorScheme: 'cadenza',
  },
  {
    id: uid(), title: 'Hours by Month — Current Year', type: 'line',
    xAxis: 'month', yAxis: 'totalHours', filters: {}, colorScheme: 'cool',
  },
  {
    id: uid(), title: 'Events by Activity', type: 'pie',
    xAxis: 'activity', yAxis: 'eventCount', filters: {}, colorScheme: 'warm',
  },
  {
    id: uid(), title: 'Cancellation Rate by Teacher', type: 'bar',
    xAxis: 'teacher', yAxis: 'cancellationRate', filters: {}, colorScheme: 'monochrome',
  },
  {
    id: uid(), title: 'Revenue vs Cost — Quarterly', type: 'bar',
    xAxis: 'quarter', yAxis: 'netRevenue', filters: {}, colorScheme: 'cadenza',
  },
] as any[];

// ─── 10. Calendar Subscriptions ───────────────────────────────────────────────

export const generateDevSubscriptions = (): CalendarSubscription[] => [
  {
    id: uid(),
    orgId: '',
    name: 'School Public Calendar',
    token: uid(),
    filters: {},
    createdBy: 'admin',
    createdAt: new Date().toISOString(),
    isActive: true,
  },
];

// ─── Blackout cross-referencing ───────────────────────────────────────────────

/** Mark events that fall within blackout Gantt blocks as hidden. */
export function applyBlackoutHiding(events: CalendarEvent[], ganttBlocks: GanttBlock[]): CalendarEvent[] {
  const blackouts = ganttBlocks.filter(b => b.isBlackout);
  if (blackouts.length === 0) return events;

  return events.map(evt => {
    if (evt.isCanceled || evt.isHidden) return evt;
    const evtStart = new Date(evt.start).getTime();
    const evtEnd = new Date(evt.end).getTime();

    for (const bo of blackouts) {
      const boStart = new Date(bo.startDate).getTime();
      const boEnd = new Date(bo.endDate + 'T23:59:59').getTime();
      if (evtStart < boEnd && evtEnd > boStart) {
        return { ...evt, isHidden: true, canceledByBlackoutId: bo.id };
      }
    }
    return evt;
  });
}

// ─── Top-level export ─────────────────────────────────────────────────────────

export const generateFullDevData = (currencySymbol = '₪', referenceDate?: Date) => {
  const teachers = generateDevTeachers(currencySymbol);
  const rooms = generateDevRooms();
  const activities = generateDevActivities();
  let events = generateDevCalendar(teachers, rooms, currencySymbol, referenceDate);
  const ganttBlocks = generateDevGantts(teachers, referenceDate);
  events = applyBlackoutHiding(events, ganttBlocks);
  const students = generateDevStudents(teachers, activities);
  const adminInboxItems = generateDevInbox(teachers, students);
  const hoursReports = generateDevHoursReports(teachers);
  const savedCharts = generateDevCharts();
  const subscriptions = generateDevSubscriptions();

  return { teachers, rooms, activities, events, ganttBlocks, students, adminInboxItems, hoursReports, savedCharts, subscriptions };
};
