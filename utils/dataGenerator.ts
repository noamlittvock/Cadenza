import { Teacher, CalendarEvent, Room, Classification, PositionAssignment, RateType, GanttBlock, Activity, Student, Guardian, StudentAssignment, AdminInboxItem, HoursReport, HoursEntry, Credential, Note, StaffDocument, RecitalEntry, ReportCard, TeachingAssignment, CalendarSubscription } from '../types';
import { COLORS } from '../constants';
import { ChartConfiguration } from '../types/chartBuilder';

// ---- Rich position/tag/name pools for maximum diversity ----

const POSITION_POOL: { name: string; categories: string[]; hourlyRange: [number, number]; globalRange: [number, number] }[] = [
    { name: 'Piano Instructor', categories: ['Individual Lesson'], hourlyRange: [100, 250], globalRange: [4000, 9000] },
    { name: 'Voice Coach', categories: ['Individual Lesson'], hourlyRange: [90, 220], globalRange: [3500, 7500] },
    { name: 'Violin Teacher', categories: ['Individual Lesson'], hourlyRange: [110, 240], globalRange: [4500, 8500] },
    { name: 'Guitar Teacher', categories: ['Individual Lesson'], hourlyRange: [80, 200], globalRange: [3000, 7000] },
    { name: 'Drum Instructor', categories: ['Individual Lesson'], hourlyRange: [85, 190], globalRange: [3000, 6500] },
    { name: 'Cello Teacher', categories: ['Individual Lesson'], hourlyRange: [120, 260], globalRange: [5000, 9000] },
    { name: 'Flute Teacher', categories: ['Individual Lesson'], hourlyRange: [90, 210], globalRange: [3500, 7000] },
    { name: 'Saxophone Teacher', categories: ['Individual Lesson'], hourlyRange: [95, 220], globalRange: [4000, 7500] },
    { name: 'Clarinet Teacher', categories: ['Individual Lesson'], hourlyRange: [90, 200], globalRange: [3500, 7000] },
    { name: 'Choir Director', categories: ['Group Lesson'], hourlyRange: [120, 300], globalRange: [5000, 12000] },
    { name: 'Theory Teacher', categories: ['Group Lesson', 'Individual Lesson'], hourlyRange: [70, 160], globalRange: [2500, 6000] },
    { name: 'Ensemble Coach', categories: ['Group Lesson'], hourlyRange: [110, 250], globalRange: [4000, 8000] },
    { name: 'Orchestra Conductor', categories: ['Group Lesson'], hourlyRange: [150, 350], globalRange: [6000, 15000] },
    { name: 'Music Therapist', categories: ['Individual Lesson', 'Group Lesson'], hourlyRange: [100, 230], globalRange: [4000, 8000] },
    { name: 'Ear Training Coach', categories: ['Group Lesson'], hourlyRange: [75, 170], globalRange: [2500, 5500] },
    { name: 'Accompanist', categories: ['Individual Lesson', 'Group Lesson'], hourlyRange: [80, 180], globalRange: [3000, 6000] },
    { name: 'Composition Tutor', categories: ['Individual Lesson'], hourlyRange: [100, 230], globalRange: [4000, 8000] },
    { name: 'Admin Coordinator', categories: ['Administrative'], hourlyRange: [60, 120], globalRange: [3500, 7000] },
    { name: 'Program Director', categories: ['Administrative'], hourlyRange: [80, 150], globalRange: [5000, 10000] },
    { name: 'Studio Manager', categories: ['Administrative'], hourlyRange: [65, 130], globalRange: [4000, 8000] },
    { name: 'Recital Coordinator', categories: ['Administrative'], hourlyRange: [60, 110], globalRange: [3000, 6000] },
    { name: 'Bass Teacher', categories: ['Individual Lesson'], hourlyRange: [85, 200], globalRange: [3500, 7000] },
    { name: 'Harp Teacher', categories: ['Individual Lesson'], hourlyRange: [130, 280], globalRange: [5500, 10000] },
    { name: 'Oud Teacher', categories: ['Individual Lesson'], hourlyRange: [90, 200], globalRange: [3500, 7000] },
    { name: 'Recorder Teacher', categories: ['Individual Lesson'], hourlyRange: [65, 150], globalRange: [2500, 5000] },
];

const TAG_POOL = [
    'Piano Dept', 'Strings Dept', 'Vocal Dept', 'Winds Dept', 'Percussion Dept', 'Brass Dept',
    'Senior Staff', 'Junior Staff', 'Part-Time', 'Full-Time', 'Guest Artist', 'Contractor',
    'Pedagogy Lead', 'Performance Faculty', 'Theory Faculty', 'Early Childhood',
    'Youth Program', 'Adult Program', 'Weekend Teacher', 'Evening Teacher',
    'Competition Coach', 'Exam Prep', 'Honors Program', 'Chamber Music',
    'Jazz Faculty', 'Classical Faculty', 'Contemporary', 'Traditional',
];

const FIRST_NAMES = [
    'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
    'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
    'Thomas', 'Sarah', 'Charles', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa',
    'Anthony', 'Margaret', 'Mark', 'Sandra', 'Steven', 'Ashley', 'Noa', 'Lior',
    'Yael', 'Omer', 'Tamar', 'Amir', 'Shira', 'Eitan', 'Roni', 'Noam',
    'Abdulrahman', 'Muhammad-Ali', 'עמית', 'שירה',
];

const LAST_NAMES = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
    'Cohen', 'Levy', 'Mizrahi', 'Goldberg', 'Shapira', 'Friedman', 'Rosenberg',
    'Chen', 'Katz', 'Schwartz', 'Al-Hashem', 'Van der Berg', 'כהן-לוי',
];

const EVENT_NAME_TEMPLATES = [
    '{pos} - {student}',
    '{pos} Lesson',
    '{pos} Session',
    '{pos} Class',
    '{pos} Training',
    '{pos} Workshop',
    'Private {pos}',
    'Advanced {pos}',
    'Beginner {pos}',
    '{student} {pos}',
];

const STUDENT_NAMES = [
    'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank',
    'Ivy', 'Jake', 'Kim', 'Leo', 'Maya', 'Nate', 'Olivia', 'Pete',
    'Quinn', 'Ruby', 'Sam', 'Tina', 'Uri', 'Vera', 'Will', 'Xena', 'Yuri', 'Zara',
];

// ---- Helpers ----

const random = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const generateId = () => Math.random().toString(36).substr(2, 9);

// Pick N unique items from array
const pickUnique = <T>(arr: T[], count: number): T[] => {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, arr.length));
};

// ---- Main Generator ----

export const generateTestTeachers = (currencySymbol: string = '₪') => {
    const teachers: Teacher[] = [];
    const usedNames = new Set<string>();

    for (let i = 1; i <= 20; i++) {
        let fullName = '';
        do { fullName = `${random(FIRST_NAMES)} ${random(LAST_NAMES)}`; } while (usedNames.has(fullName));
        usedNames.add(fullName);

        const roll = Math.random();
        const posCount = roll < 0.30 ? 1 : roll < 0.65 ? 2 : roll < 0.90 ? 3 : 4;
        const chosenPositions = pickUnique(POSITION_POOL, posCount);

        const positionAssignments: PositionAssignment[] = chosenPositions.map((pos, idx) => {
            const rateType: RateType = Math.random() > 0.4 ? 'HOURLY' : 'GLOBAL_MONTHLY';
            // hourly rate: 150–300 step 50 (150, 200, 250, 300)
            // global monthly: 1000–6000 (we can use step 1000)
            const rateValue = rateType === 'HOURLY'
                ? (randomInt(3, 6) * 50)
                : (randomInt(1, 6) * 1000);

            return {
                id: `T${i}_PA${idx}`,
                positionName: pos.name,
                category: random(pos.categories),
                rateType,
                rateValue,
            };
        });

        const tagCount = randomInt(1, 4);
        const tags = pickUnique(TAG_POOL, tagCount);

        teachers.push({
            id: `T${i}`, fullName, positions: positionAssignments.map(pa => pa.positionName), positionAssignments,
            tags, phone: `555-${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
            email: `${fullName.toLowerCase().replace(' ', '.')}@music.com`, color: COLORS[(i - 1) % COLORS.length]
        });
    }

    // Enrich teachers with credentials, notes, documents, Google Calendar sync
    const credentialData: Credential[][] = [
        [{ id: generateId(), institution: 'Berklee College of Music', qualificationType: 'BM in Music Performance', year: 2015 },
         { id: generateId(), institution: 'Royal Academy of Music', qualificationType: 'ABRSM Grade 8 Distinction', year: 2012 }],
        [{ id: generateId(), institution: 'Juilliard School', qualificationType: 'MM in Piano Performance', year: 2018 }],
        [{ id: generateId(), institution: 'Tel Aviv University', qualificationType: 'BA Music Education', year: 2016 },
         { id: generateId(), institution: 'Rimon School of Music', qualificationType: 'Jazz Performance Certificate', year: 2014 }],
        [{ id: generateId(), institution: 'Jerusalem Academy', qualificationType: 'Advanced Conducting Diploma', year: 2019 }],
    ];
    for (let i = 0; i < 4 && i < teachers.length; i++) {
        teachers[i].credentials = credentialData[i];
    }
    // Teachers 0-1: notes
    if (teachers.length > 0) teachers[0].notes = [{ id: generateId(), content: 'Prefers morning teaching slots. Available for substitute teaching on short notice.', createdAt: '2025-01-20T09:00:00Z', createdBy: 'admin@cadenza.app' }];
    if (teachers.length > 1) teachers[1].notes = [{ id: generateId(), content: 'Requires accessibility accommodations for ground-floor rooms.', createdAt: '2025-02-05T14:00:00Z', createdBy: 'admin@cadenza.app' }];
    // Teacher 2: document
    if (teachers.length > 2) teachers[2].documents = [{ id: generateId(), label: 'Teaching certification', url: 'https://docs.example.com/cert_T3.pdf', uploadedAt: '2025-01-10T08:00:00Z', uploadedBy: 'admin@cadenza.app' }];
    // Teachers 0-2: Google Calendar sync
    for (let i = 0; i < 3 && i < teachers.length; i++) {
        teachers[i].googleCalendarSyncEnabled = true;
        teachers[i].googleCalendarId = `teacher${i + 1}@group.calendar.google.com`;
    }

    return teachers;
};

export const generateTestCalendar = (teachers: Teacher[], existingRooms: Room[], currencySymbol: string = '₪') => {
    const events: CalendarEvent[] = [];
    const TARGET_EVENT_COUNT = 200;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const DURATIONS = [30, 45, 60, 90, 120, 150, 180]; // 30m - 3h

    const CLASSIFICATIONS = [Classification.INDIVIDUAL, Classification.GROUP, Classification.OTHER];

    for (let i = 0; i < TARGET_EVENT_COUNT; i++) {
        const teacher = random(teachers);
        const pa = teacher ? random(teacher.positionAssignments) : undefined;
        const room = existingRooms.length > 0 ? random(existingRooms) : { id: 'R1', name: 'Virtual', itinerary: '' };

        const dayOffset = randomInt(-30, 30);
        const date = new Date(today);
        date.setDate(date.getDate() + dayOffset);

        // 08:00–22:00
        const startHour = randomInt(8, 21); // up to 21 (9 PM) so end time can be up to 10 PM roughly depending on duration
        const startMinute = random([0, 15, 30, 45]); // 15-minute increments

        const start = new Date(date);
        start.setHours(startHour, startMinute, 0, 0);

        const duration = random(DURATIONS);
        const end = new Date(start.getTime() + duration * 60000);

        // Ensure within 22:00
        if (end.getHours() >= 22 && end.getMinutes() > 0) {
            end.setHours(22, 0, 0, 0);
        }

        const template = random(EVENT_NAME_TEMPLATES);
        const posShort = pa ? pa.positionName.split(' ')[0] : 'Event';
        const studentName = random(STUDENT_NAMES);
        const eventName = template.replace('{pos}', posShort).replace('{student}', studentName);

        const isCanceled = Math.random() < 0.10;
        const isHidden = !isCanceled && Math.random() < 0.05;

        // Add cancellation pay status randomly if canceled
        const cancellationPayStatus = isCanceled ? (Math.random() < 0.5 ? 'PAID_CANCELLATION' : 'NO_PAY_CANCELLATION') as any : undefined;

        let classification: string = Classification.INDIVIDUAL;
        if (pa) {
            if (pa.category === 'Individual Lesson') classification = Classification.INDIVIDUAL;
            else if (pa.category === 'Group Lesson') classification = Classification.GROUP;
            else if (pa.category === 'Administrative') classification = Classification.OTHER;
            else classification = random(CLASSIFICATIONS);
        }

        // Randomly assign special payment methods to ~15% of events
        const isSpecialPayment = Math.random() < 0.15;
        let pricingSnapshot: any = undefined;
        let overrideFlags: any = undefined;

        if (isSpecialPayment) {
            const isNoPayment = Math.random() < 0.2; // 20% of special payments are NONE
            if (isNoPayment) {
                overrideFlags = { paymentMethod: 'NONE' };
            } else {
                const oneOffValue = randomInt(2, 10) * 100; // e.g. 200 to 1000
                overrideFlags = { paymentMethod: 'ONE_OFF' };
                pricingSnapshot = {
                    rateType: 'ONE_OFF',
                    rateValue: oneOffValue,
                    source: 'OVERRIDE'
                };
            }
        }

        events.push({
            id: `GEN_${generateId()}_${i}`,
            name: eventName,
            description: pa ? `${pa.positionName} (${duration} min)` : `Random Event`,
            teacherId: teacher?.id,
            roomId: room.id,
            positionId: pa?.id,
            classification,
            start: start.toISOString(),
            end: end.toISOString(),
            isCanceled,
            isHidden,
            cancellationPayStatus,
            overrideFlags,
            pricingSnapshot
        } as any);
    }

    // --- Deliberate room conflicts for QA testing ---
    const conflictRooms = existingRooms.slice(0, 3);
    for (let c = 0; c < 4; c++) {
        const room = conflictRooms[c % conflictRooms.length];
        const teacher1 = teachers[c % teachers.length];
        const teacher2 = teachers[(c + 1) % teachers.length];

        const dayOffset = randomInt(-7, 7);
        const conflictDate = new Date(today);
        conflictDate.setDate(conflictDate.getDate() + dayOffset);

        const startHour = randomInt(9, 16);

        // Event A: 60 min
        const startA = new Date(conflictDate);
        startA.setHours(startHour, 0, 0, 0);
        const endA = new Date(startA.getTime() + 60 * 60000);

        // Event B: starts 30 min after A, guaranteed 30-min overlap
        const startB = new Date(startA.getTime() + 30 * 60000);
        const endB = new Date(startB.getTime() + 60 * 60000);

        events.push({
            id: `CONFLICT_A_${c}`,
            name: `Conflict Lesson A${c + 1}`,
            description: 'Deliberate conflict for QA',
            teacherId: teacher1.id,
            roomId: room.id,
            classification: Classification.INDIVIDUAL,
            start: startA.toISOString(),
            end: endA.toISOString(),
            isCanceled: false,
            isHidden: false,
        } as any);

        events.push({
            id: `CONFLICT_B_${c}`,
            name: `Conflict Lesson B${c + 1}`,
            description: 'Deliberate conflict for QA',
            teacherId: teacher2.id,
            roomId: room.id,
            classification: Classification.INDIVIDUAL,
            start: startB.toISOString(),
            end: endB.toISOString(),
            isCanceled: false,
            isHidden: false,
        } as any);
    }

    return events;
};

export const generateTestGantts = (teachers: Teacher[]): GanttBlock[] => {
    const gantts: GanttBlock[] = [];
    const TARGET_GANTT_COUNT = 15;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const TITLES = ['Summer Break', 'Workshop Series', 'Conference', 'Studio Renovation', 'Tour', 'Examination Period'];

    for (let i = 0; i < TARGET_GANTT_COUNT; i++) {
        const dayOffsetStart = randomInt(-30, 30);
        const start = new Date(today);
        start.setDate(start.getDate() + dayOffsetStart);

        const durationDays = randomInt(2, 14);
        const end = new Date(start);
        end.setDate(end.getDate() + durationDays);
        end.setHours(23, 59, 59, 999);

        const isTeacherSpecific = Math.random() < 0.5;
        const assignedTeacher = isTeacherSpecific ? random(teachers) : undefined;
        const baseColor = assignedTeacher ? assignedTeacher.color : random(COLORS);

        gantts.push({
            id: `GEN_GANTT_${generateId()}_${i}`,
            title: assignedTeacher ? `${assignedTeacher.fullName.split(' ')[0]} - ${random(TITLES)}` : random(TITLES),
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            color: baseColor,
            isBlackout: false
        });
    }

    return gantts;
};

export const generateTestActivities = (): Activity[] => {
    const now = new Date().toISOString();
    return [
        {
            id: 'ACT_1', orgId: '', name: 'Piano', type: 'INSTRUCTIONAL' as any,
            subcategories: [
                { id: 'SC_1_1', name: 'Classical Piano', isArchived: false },
                { id: 'SC_1_2', name: 'Jazz Piano', isArchived: false },
                { id: 'SC_1_3', name: 'Accompaniment', isArchived: false },
            ],
            isArchived: false, createdAt: now, updatedAt: now,
        },
        {
            id: 'ACT_2', orgId: '', name: 'Strings', type: 'INSTRUCTIONAL' as any,
            subcategories: [
                { id: 'SC_2_1', name: 'Violin', isArchived: false },
                { id: 'SC_2_2', name: 'Cello', isArchived: false },
                { id: 'SC_2_3', name: 'Guitar', isArchived: false },
            ],
            isArchived: false, createdAt: now, updatedAt: now,
        },
        {
            id: 'ACT_3', orgId: '', name: 'Voice', type: 'INSTRUCTIONAL' as any,
            subcategories: [
                { id: 'SC_3_1', name: 'Classical Voice', isArchived: false },
                { id: 'SC_3_2', name: 'Pop/Contemporary', isArchived: false },
            ],
            isArchived: false, createdAt: now, updatedAt: now,
        },
        {
            id: 'ACT_4', orgId: '', name: 'Theory & Musicianship', type: 'INSTRUCTIONAL' as any,
            subcategories: [
                { id: 'SC_4_1', name: 'Music Theory', isArchived: false },
                { id: 'SC_4_2', name: 'Ear Training', isArchived: false },
                { id: 'SC_4_3', name: 'Composition', isArchived: false },
            ],
            isArchived: false, createdAt: now, updatedAt: now,
        },
        {
            id: 'ACT_5', orgId: '', name: 'Ensembles', type: 'INSTRUCTIONAL' as any,
            subcategories: [
                { id: 'SC_5_1', name: 'Orchestra', isArchived: false },
                { id: 'SC_5_2', name: 'Chamber Music', isArchived: false },
                { id: 'SC_5_3', name: 'Choir', isArchived: false },
            ],
            isArchived: false, createdAt: now, updatedAt: now,
        },
    ];
};

export const generateTestStudents = (teachers: Teacher[], activities: Activity[]): Student[] => {
    const students: Student[] = [];
    const now = new Date().toISOString();
    const usedNames = new Set<string>();

    for (let i = 1; i <= 8; i++) {
        let fullName = '';
        do { fullName = `${random(STUDENT_NAMES)} ${random(LAST_NAMES)}`; } while (usedNames.has(fullName));
        usedNames.add(fullName);

        const isMinor = Math.random() < 0.6;
        const birthYear = isMinor ? randomInt(2010, 2018) : randomInt(1985, 2005);
        const dateOfBirth = `${birthYear}-${String(randomInt(1, 12)).padStart(2, '0')}-${String(randomInt(1, 28)).padStart(2, '0')}`;

        const guardians: Guardian[] = isMinor ? [{
            id: generateId(),
            fullName: `${random(FIRST_NAMES)} ${fullName.split(' ')[1]}`,
            relationship: random(['Parent', 'Mother', 'Father', 'Guardian']),
            phone: `555-${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
            email: `parent.${fullName.toLowerCase().replace(' ', '.')}@email.com`,
        }] : [];

        // Assign 1-2 activities
        const assignmentCount = randomInt(1, 2);
        const chosenActivities = pickUnique(activities, assignmentCount);
        const assignments: StudentAssignment[] = chosenActivities.map((act, idx) => {
            const subcat = random(act.subcategories);
            const teacher = random(teachers);
            return {
                id: `SA_${i}_${idx}`,
                activityId: act.id,
                subcategoryId: subcat.id,
                staffMemberId: teacher.id,
                teachingAssignmentId: '',
                startDate: `${randomInt(2024, 2025)}-09-01`,
                status: 'ACTIVE' as const,
            };
        });

        students.push({
            id: `STU_${i}`,
            orgId: '',
            fullName,
            dateOfBirth,
            isMinor,
            currentGrade: isMinor ? randomInt(1, 12) : undefined,
            phone: isMinor ? undefined : `555-${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
            email: isMinor ? undefined : `${fullName.toLowerCase().replace(' ', '.')}@email.com`,
            guardians,
            assignments,
            pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] },
            notes: [],
            documents: [],
            profileStatus: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
        });
    }

    // Enrich students with lean pedagogical data
    const reportCardContents = [
        'Excellent progress in scales and arpeggios. Ready for grade 3 exam.',
        'Needs more practice on sight-reading. Rhythm is improving steadily.',
        'Outstanding performance at year-end recital. Continue current repertoire.',
    ];
    const recitalData = [
        { title: 'Winter Recital 2025', repertoire: 'Bach Invention No. 8, Chopin Waltz Op. 64 No. 2', notes: 'Performed with confidence; minor hesitation in the Chopin middle section.' },
        { title: 'Spring Concert 2025', repertoire: 'Suzuki Book 4 — Concerto in A minor', notes: 'First ensemble performance. Good intonation.' },
        { title: 'Summer Workshop Showcase', repertoire: 'Original composition — "Morning Light"', notes: 'Creative arrangement. Audience was engaged.' },
    ];
    // Students 0-2: report cards
    for (let i = 0; i < 3 && i < students.length; i++) {
        students[i].pedagogicalRecord.reportCards.push({
            id: generateId(), date: '2025-01-15', content: reportCardContents[i],
            loggedAt: '2025-01-15T10:00:00Z', loggedBy: 'admin@cadenza.app',
        });
    }
    // Students 1-3: recitals
    for (let i = 1; i <= 3 && i < students.length; i++) {
        const r = recitalData[i - 1];
        students[i].pedagogicalRecord.recitalHistory.push({
            id: generateId(), date: `2025-0${i + 1}-20`, title: r.title,
            repertoire: r.repertoire, notes: r.notes,
            loggedAt: `2025-0${i + 1}-20T14:00:00Z`, loggedBy: 'admin@cadenza.app',
        });
    }
    // Students 0, 4: notes
    if (students.length > 0) students[0].notes.push({ id: generateId(), content: 'Prefers afternoon lesson slots. Very motivated student.', createdAt: '2025-02-10T09:00:00Z', createdBy: 'admin@cadenza.app' });
    if (students.length > 4) students[4].notes.push({ id: generateId(), content: 'Considering switching from piano to composition track.', createdAt: '2025-03-01T11:30:00Z', createdBy: 'admin@cadenza.app' });
    // Student 2: document
    if (students.length > 2) students[2].documents.push({ id: generateId(), label: 'Medical clearance form', url: 'https://docs.example.com/medical_clearance_STU3.pdf', uploadedAt: '2025-01-05T08:00:00Z', uploadedBy: 'admin@cadenza.app' });

    return students
};

export const generateTestAdminInbox = (teachers: Teacher[], students: Student[]): AdminInboxItem[] => {
    const now = new Date().toISOString();
    const items: AdminInboxItem[] = [];

    items.push({
        id: generateId(),
        orgId: '',
        type: 'TASK',
        status: 'OPEN',
        title: 'Review new student registrations',
        message: 'Multiple students registered this week and need assignment review.',
        relatedEntityType: 'STUDENT',
        relatedEntityIds: students.slice(0, 3).map(s => s.id),
        createdAt: now,
    });

    items.push({
        id: generateId(),
        orgId: '',
        type: 'TASK',
        status: 'OPEN',
        title: 'Update teacher credentials',
        message: `${teachers[0]?.fullName || 'A teacher'}'s certification is expiring soon.`,
        relatedEntityType: 'TEACHER',
        relatedEntityIds: teachers.slice(0, 1).map(t => t.id),
        createdAt: now,
    });

    items.push({
        id: generateId(),
        orgId: '',
        type: 'TASK',
        status: 'DONE',
        title: 'Prepare monthly financial report',
        message: 'Generate and review the monthly cost analysis for administration.',
        createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
        markedDoneAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    });

    items.push({
        id: generateId(),
        orgId: '',
        type: 'NOTIFICATION',
        status: 'OPEN',
        title: 'System maintenance scheduled',
        message: 'Scheduled maintenance window this Sunday 2:00-4:00 AM.',
        createdAt: now,
    });

    return items;
};

export const generateTestSavedCharts = (): ChartConfiguration[] => {
    const now = new Date().toISOString();
    return [
        {
            id: `chart_${generateId()}`,
            title: 'Cost by Teacher',
            description: 'Total payroll cost grouped by each teacher',
            dataSource: 'financial-dashboard' as const,
            dimension: 'teacher' as const,
            metrics: [{ metricId: 'totalCost' as const, aggregation: 'SUM' as const }],
            visualization: 'bar' as const,
            sort: { by: 'totalCost' as const, direction: 'desc' as const },
            filterMode: 'live' as const,
            chartFilters: { teacherIds: [], positionNames: [], tags: [], categories: [], rateTypes: [] },
            createdAt: now,
            updatedAt: now,
        },
        {
            id: `chart_${generateId()}`,
            title: 'Hours by Month',
            description: 'Active and canceled hours tracked monthly',
            dataSource: 'financial-dashboard' as const,
            dimension: 'month' as const,
            metrics: [
                { metricId: 'activeHours' as const, aggregation: 'SUM' as const },
                { metricId: 'canceledHours' as const, aggregation: 'SUM' as const },
            ],
            visualization: 'line' as const,
            filterMode: 'live' as const,
            chartFilters: { teacherIds: [], positionNames: [], tags: [], categories: [], rateTypes: [] },
            createdAt: now,
            updatedAt: now,
        },
        {
            id: `chart_${generateId()}`,
            title: 'Events by Category',
            description: 'Event distribution across position categories',
            dataSource: 'financial-dashboard' as const,
            dimension: 'category' as const,
            metrics: [{ metricId: 'eventCount' as const, aggregation: 'COUNT' as const }],
            visualization: 'pie' as const,
            filterMode: 'live' as const,
            chartFilters: { teacherIds: [], positionNames: [], tags: [], categories: [], rateTypes: [] },
            createdAt: now,
            updatedAt: now,
        },
        {
            id: `chart_${generateId()}`,
            title: 'Teacher Rate Comparison',
            description: 'Hourly and global costs stacked by teacher',
            dataSource: 'financial-dashboard' as const,
            dimension: 'teacher' as const,
            metrics: [
                { metricId: 'hourlyCost' as const, aggregation: 'AVG' as const },
                { metricId: 'globalCost' as const, aggregation: 'SUM' as const },
            ],
            visualization: 'stacked-bar' as const,
            sort: { by: 'hourlyCost' as const, direction: 'desc' as const },
            filterMode: 'live' as const,
            chartFilters: { teacherIds: [], positionNames: [], tags: [], categories: [], rateTypes: [] },
            createdAt: now,
            updatedAt: now,
        },
    ];
};

export const generateTestHoursReports = (teachers: Teacher[], events: CalendarEvent[]): HoursReport[] => {
    const now = new Date().toISOString();
    const reports: HoursReport[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use first 3 teachers for hours reports
    const reportTeachers = teachers.slice(0, 3);

    reportTeachers.forEach((teacher, teacherIdx) => {
        const periodStart = new Date(today);
        periodStart.setDate(periodStart.getDate() - 30);
        const periodStartStr = periodStart.toISOString().split('T')[0];

        const periodEnd = new Date(today);
        periodEnd.setDate(periodEnd.getDate() + 1);
        const periodEndStr = periodEnd.toISOString().split('T')[0];

        // PENDING report (no entries yet)
        if (teacherIdx === 0) {
            reports.push({
                id: `rpt_${generateId()}`,
                orgId: '',
                staffMemberId: teacher.id,
                token: `token_${generateId()}`,
                periodStart: periodStartStr,
                periodEnd: periodEndStr,
                status: 'PENDING' as const,
                createdBy: 'admin@cadenza.app',
                createdAt: now,
            });
        }

        // SUBMITTED report (with entries)
        if (teacherIdx === 1) {
            // Find up to 4 events for this teacher within the period
            const teacherEvents = events
                .filter(e => e.teacherId === teacher.id)
                .slice(0, 4);

            const reportedEntries: HoursEntry[] = [];

            // Add 3 CALENDAR_CONFIRMED, 1 CALENDAR_ADJUSTED, 1 CALENDAR_NOT_COMPLETED
            teacherEvents.forEach((evt, idx) => {
                const baseDate = evt.start.split('T')[0];
                if (idx === 0) {
                    reportedEntries.push({
                        id: `entry_${generateId()}`,
                        date: baseDate,
                        hours: 1.5,
                        entryType: 'CALENDAR_CONFIRMED' as const,
                        sourceEventId: evt.id,
                    });
                } else if (idx === 1) {
                    reportedEntries.push({
                        id: `entry_${generateId()}`,
                        date: baseDate,
                        hours: 1.0,
                        entryType: 'CALENDAR_ADJUSTED' as const,
                        sourceEventId: evt.id,
                    });
                } else if (idx === 2) {
                    reportedEntries.push({
                        id: `entry_${generateId()}`,
                        date: baseDate,
                        hours: 0,
                        entryType: 'CALENDAR_NOT_COMPLETED' as const,
                        sourceEventId: evt.id,
                        absenceReason: 'Illness',
                    });
                }
            });

            // Add 1 MANUAL entry
            reportedEntries.push({
                id: `entry_${generateId()}`,
                date: new Date(today.getTime() - 5 * 86400000).toISOString().split('T')[0],
                hours: 2.0,
                entryType: 'MANUAL' as const,
                description: 'Curriculum planning meeting',
            });

            const submittedAt = new Date(Date.now() - 2 * 86400000).toISOString();
            reports.push({
                id: `rpt_${generateId()}`,
                orgId: '',
                staffMemberId: teacher.id,
                token: `token_${generateId()}`,
                periodStart: periodStartStr,
                periodEnd: periodEndStr,
                status: 'SUBMITTED' as const,
                submittedAt,
                reportedEntries,
                createdBy: 'admin@cadenza.app',
                createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
            });
        }

        // REVIEWED report (same as SUBMITTED with admin notes)
        if (teacherIdx === 2) {
            const teacherEvents = events
                .filter(e => e.teacherId === teacher.id)
                .slice(0, 4);

            const reportedEntries: HoursEntry[] = teacherEvents.map((evt, idx) => {
                const baseDate = evt.start.split('T')[0];
                if (idx === 0) {
                    return {
                        id: `entry_${generateId()}`,
                        date: baseDate,
                        hours: 1.5,
                        entryType: 'CALENDAR_CONFIRMED' as const,
                        sourceEventId: evt.id,
                    };
                } else if (idx === 1) {
                    return {
                        id: `entry_${generateId()}`,
                        date: baseDate,
                        hours: 1.0,
                        entryType: 'CALENDAR_ADJUSTED' as const,
                        sourceEventId: evt.id,
                    };
                } else if (idx === 2) {
                    return {
                        id: `entry_${generateId()}`,
                        date: baseDate,
                        hours: 0,
                        entryType: 'CALENDAR_NOT_COMPLETED' as const,
                        sourceEventId: evt.id,
                        absenceReason: 'Schedule conflict',
                    };
                }
                return {
                    id: `entry_${generateId()}`,
                    date: baseDate,
                    hours: 1.5,
                    entryType: 'CALENDAR_CONFIRMED' as const,
                    sourceEventId: evt.id,
                };
            });

            reportedEntries.push({
                id: `entry_${generateId()}`,
                date: new Date(today.getTime() - 5 * 86400000).toISOString().split('T')[0],
                hours: 2.0,
                entryType: 'MANUAL' as const,
                description: 'Curriculum planning meeting',
            });

            const submittedAt = new Date(Date.now() - 5 * 86400000).toISOString();
            reports.push({
                id: `rpt_${generateId()}`,
                orgId: '',
                staffMemberId: teacher.id,
                token: `token_${generateId()}`,
                periodStart: periodStartStr,
                periodEnd: periodEndStr,
                status: 'REVIEWED' as const,
                submittedAt,
                reportedEntries,
                adminNotes: 'Hours verified. Period adjustment noted.',
                createdBy: 'admin@cadenza.app',
                createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
            });
        }
    });

    return reports;
};

export const generateTestSubscriptions = (teachers: Teacher[], rooms: Room[], activities: Activity[]): CalendarSubscription[] => {
    const now = new Date().toISOString();
    return [
        {
            id: `SUB_${generateId()}`,
            orgId: '',
            name: 'Piano Department Feed',
            token: `${generateId()}-${generateId()}`,
            filters: {
                staffMemberIds: teachers.length > 0 ? [teachers[0].id] : [],
                tags: ['Piano Dept'],
            },
            createdBy: 'admin@cadenza.app',
            createdAt: now,
            isActive: true,
        },
        {
            id: `SUB_${generateId()}`,
            orgId: '',
            name: 'Concert Hall Schedule',
            token: `${generateId()}-${generateId()}`,
            filters: {
                roomIds: rooms.length > 0 ? [rooms.find(r => r.name === 'Concert Hall')?.id || rooms[0].id] : [],
            },
            createdBy: 'admin@cadenza.app',
            createdAt: now,
            isActive: true,
        },
    ];
};

export const generateTestData = (currencySymbol: string = '₪') => {
    const rooms: Room[] = [
        { id: 'R1', name: 'Studio A', itinerary: 'Grand Piano, Sound System' },
        { id: 'R2', name: 'Studio B', itinerary: 'Upright Piano, Whiteboard' },
        { id: 'R3', name: 'Studio C', itinerary: 'Digital Piano, Recording Booth' },
        { id: 'R4', name: 'Practice Room 1', itinerary: 'Small Room, Mirror' },
        { id: 'R5', name: 'Practice Room 2', itinerary: 'Small Room, Music Stand' },
        { id: 'R6', name: 'Concert Hall', itinerary: 'Stage, Grand Piano, PA System' },
        { id: 'R7', name: 'Ensemble Room', itinerary: 'Large Room, Chairs, Stands' },
        { id: 'R8', name: 'Theory Lab', itinerary: 'Computers, Headphones' },
    ];
    const teachers = generateTestTeachers(currencySymbol);
    const events = generateTestCalendar(teachers, rooms, currencySymbol);
    const ganttBlocks = generateTestGantts(teachers);
    const activities = generateTestActivities();
    const students = generateTestStudents(teachers, activities);
    const adminInboxItems = generateTestAdminInbox(teachers, students);
    const savedCharts = generateTestSavedCharts();
    const hoursReports = generateTestHoursReports(teachers, events);
    const subscriptions = generateTestSubscriptions(teachers, rooms, activities);

    // Enrich first 5 teachers with teaching assignments linking to activities
    teachers.slice(0, 5).forEach((teacher, idx) => {
        const activity = activities[idx % activities.length];
        const subcategory = activity.subcategories[0];
        teacher.teachingAssignments = [{
            id: generateId(),
            activityId: activity.id,
            subcategoryId: subcategory.id,
            startDate: '2024-09-01',
            isEnsemble: idx >= 3,
            isArchived: false,
        }];
    });

    return { teachers, events, rooms, ganttBlocks, activities, students, adminInboxItems, savedCharts, hoursReports, subscriptions };
};
