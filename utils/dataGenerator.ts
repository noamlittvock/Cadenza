import { Teacher, CalendarEvent, Room, Classification, PositionAssignment, RateType } from '../types';
import { COLORS } from '../constants';

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
];

const LAST_NAMES = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
    'Cohen', 'Levy', 'Mizrahi', 'Goldberg', 'Shapira', 'Friedman', 'Rosenberg',
    'Chen', 'Katz', 'Schwartz',
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

export const generateTestData = () => {
    const teachers: Teacher[] = [];
    const events: CalendarEvent[] = [];
    const usedNames = new Set<string>();

    // Generate 20 Teachers with diverse positions, tags, and rates
    for (let i = 1; i <= 20; i++) {
        // Unique name
        let fullName = '';
        do {
            fullName = `${random(FIRST_NAMES)} ${random(LAST_NAMES)}`;
        } while (usedNames.has(fullName));
        usedNames.add(fullName);

        // 1-4 positions per teacher (weighted: ~30% get 1, ~35% get 2, ~25% get 3, ~10% get 4)
        const roll = Math.random();
        const posCount = roll < 0.30 ? 1 : roll < 0.65 ? 2 : roll < 0.90 ? 3 : 4;
        const chosenPositions = pickUnique(POSITION_POOL, posCount);

        const positionAssignments: PositionAssignment[] = chosenPositions.map((pos, idx) => {
            // Diverse rate types: ~60% hourly, ~40% global monthly
            const rateType: RateType = Math.random() > 0.4 ? 'HOURLY' : 'GLOBAL_MONTHLY';
            // Hourly: ₪100-150 in steps of 10 (round numbers)
            // Global Monthly: ₪2,000-8,000 in steps of 500 (round numbers)
            const rateValue = rateType === 'HOURLY'
                ? (randomInt(10, 15) * 10)      // 100, 110, 120, 130, 140, 150
                : (randomInt(4, 16) * 500);     // 2000, 2500, 3000, ..., 8000

            return {
                id: `T${i}_PA${idx}`,
                positionName: pos.name,
                category: random(pos.categories),
                rateType,
                rateValue,
            };
        });

        // 1-4 tags per teacher
        const tagCount = randomInt(1, 4);
        const tags = pickUnique(TAG_POOL, tagCount);

        teachers.push({
            id: `T${i}`,
            fullName,
            positions: positionAssignments.map(pa => pa.positionName),
            positionAssignments,
            tags,
            phone: `555-${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
            email: `${fullName.toLowerCase().replace(' ', '.')}@music.com`,
            color: COLORS[(i - 1) % COLORS.length],
        });
    }

    // Generate ~200 Events with diverse position linkage
    const TARGET_EVENT_COUNT = 200;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    const DURATIONS = [30, 30, 45, 45, 60, 60, 60, 90, 120]; // weighted towards 45-60 min

    const CLASSIFICATIONS = [
        Classification.INDIVIDUAL, Classification.INDIVIDUAL, Classification.INDIVIDUAL,
        Classification.GROUP, Classification.GROUP,
        Classification.OTHER,
    ]; // weighted toward individual

    for (let i = 0; i < TARGET_EVENT_COUNT; i++) {
        const teacher = random(teachers);

        // Pick a random position from this teacher's assignments
        const pa = random(teacher.positionAssignments);
        const room = random(rooms);

        // Random date: weighted more toward current month (+/- 45 days, skewed recent)
        const dayOffset = Math.random() < 0.6
            ? randomInt(-14, 30)   // 60% within 2 weeks ago to 1 month ahead
            : randomInt(-60, 60);  // 40% across wider range
        const date = new Date(today);
        date.setDate(date.getDate() + dayOffset);

        // Random start hour (8 AM to 8 PM)
        const startHour = randomInt(8, 20);
        const startMinute = random([0, 15, 30, 45]);

        const start = new Date(date);
        start.setHours(startHour, startMinute, 0, 0);

        const duration = random(DURATIONS);
        const end = new Date(start.getTime() + duration * 60000);

        // Event name from template
        const template = random(EVENT_NAME_TEMPLATES);
        const posShort = pa.positionName.split(' ')[0]; // "Piano" from "Piano Instructor"
        const studentName = random(STUDENT_NAMES);
        const eventName = template.replace('{pos}', posShort).replace('{student}', studentName);

        // ~10% canceled, ~5% hidden
        const isCanceled = Math.random() < 0.10;
        const isHidden = !isCanceled && Math.random() < 0.05;

        // Classification: use position's category if it maps, else random
        let classification: Classification;
        if (pa.category === 'Individual Lesson') classification = Classification.INDIVIDUAL;
        else if (pa.category === 'Group Lesson') classification = Classification.GROUP;
        else if (pa.category === 'Administrative') classification = Classification.OTHER;
        else classification = random(CLASSIFICATIONS);

        events.push({
            id: `GEN_${generateId()}_${i}`,
            name: eventName,
            description: `${pa.positionName} (${duration} min) — ${pa.rateType === 'HOURLY' ? `₪${pa.rateValue}/hr` : `₪${pa.rateValue}/mo global`}`,
            teacherId: teacher.id,
            roomId: room.id,
            positionId: pa.id,
            classification: classification as string,
            start: start.toISOString(),
            end: end.toISOString(),
            isCanceled,
            isHidden,
        });
    }

    return { teachers, events, rooms };
};
