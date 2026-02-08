import { Teacher, CalendarEvent, Room, Classification } from '../types';
import { COLORS } from '../constants';

const POSITIONS = ['Piano Instructor', 'Voice Coach', 'Violin Teacher', 'Guitar Teacher', 'Drum Instructor', 'Theory Teacher'];
const TAGS = ['Piano Dept', 'Strings Dept', 'Vocal Dept', 'Senior Staff', 'Junior Staff', 'Guest Artist'];
const FIRST_NAMES = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson'];

const random = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export const generateTestData = () => {
    const teachers: Teacher[] = [];
    const events: CalendarEvent[] = [];

    // Generate 20 Teachers
    for (let i = 1; i <= 20; i++) {
        teachers.push({
            id: `T${i}`,
            fullName: `${random(FIRST_NAMES)} ${random(LAST_NAMES)}`,
            positions: [random(POSITIONS)],
            tags: [random(TAGS)],
            phone: `555-01${i.toString().padStart(2, '0')}`,
            email: `teacher${i}@music.com`,
            color: COLORS[(i - 1) % COLORS.length],
        });
    }

    // Generate ~200 Scattered Events
    const TARGET_EVENT_COUNT = 200;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rooms: Room[] = [
        { id: 'R1', name: 'Studio A', itinerary: 'Grand Piano' },
        { id: 'R2', name: 'Studio B', itinerary: 'Upright Piano' },
        { id: 'R3', name: 'Studio C', itinerary: 'Digital Piano' },
        { id: 'R4', name: 'Practice 1', itinerary: 'Small Room' },
        { id: 'R5', name: 'Practice 2', itinerary: 'Small Room' },
        { id: 'R6', name: 'Hall', itinerary: 'Concert Hall' },
    ];

    const DURATIONS = [30, 45, 60, 90, 120];

    for (let i = 0; i < TARGET_EVENT_COUNT; i++) {
        const teacher = random(teachers);
        const room = random(rooms);

        // Random date +/- 60 days
        const dayOffset = randomInt(-60, 60);
        const date = new Date(today);
        date.setDate(date.getDate() + dayOffset);

        // Random start hour (8 AM to 8 PM)
        const startHour = randomInt(8, 20);
        const startMinute = random([0, 15, 30, 45]);

        const start = new Date(date);
        start.setHours(startHour, startMinute, 0, 0);

        const duration = random(DURATIONS);
        const end = new Date(start.getTime() + duration * 60000);

        // Basic conflict avoidance (very simple check, or just let them overlap for stress test)
        // User asked to see how stress test affects app, so overlaps are arguably good.
        // We won't strictly prevent overlaps here to keep it fast and "stressful".

        events.push({
            id: `GEN_${generateId()}_${i}`,
            name: `${args(teacher.positions[0])} Lesson`,
            description: `Generated event (${duration} min)`,
            teacherId: teacher.id,
            roomId: room.id,
            classification: Classification.INDIVIDUAL,
            start: start.toISOString(),
            end: end.toISOString(),
            isCanceled: false,
            isHidden: false,
        });
    }

    return { teachers, events, rooms };
};

const generateId = () => Math.random().toString(36).substr(2, 9);

function args(pos: string): string {
    return pos.split(' ')[0];
}
