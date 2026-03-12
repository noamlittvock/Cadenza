import { describe, it, expect } from 'vitest';
import { computePayroll } from './payrollEngine';
import { CalendarEvent, Teacher } from '../types';

describe('Payroll Engine', () => {
    const mockTeacher: Teacher = {
        id: 't1',
        fullName: 'Jane Doe',
        phone: '',
        email: '',
        color: '#000',
        positions: [],
        positionAssignments: [
            {
                id: 'pos1',
                positionName: 'Guitar Instructor',
                category: 'Individual Lesson',
                rateValue: 100,
                rateType: 'HOURLY'
            }
        ],
        tags: []
    };

    const baseEvent = {
        id: 'evt1',
        name: 'Test Event',
        description: '',
        isHidden: false,
        start: '2026-05-15T10:00:00.000Z',
        end: '2026-05-15T11:00:00.000Z',
        isCanceled: false,
        teacherId: 't1'
    };

    it('Test 1: Teacher One-Off Included', () => {
        const event: CalendarEvent = {
            ...baseEvent,
            positionId: 'pos1', // Has position
            overrideFlags: {
                paymentMethod: 'ONE_OFF'
            },
            pricingSnapshot: {
                rateValue: 500,
                rateType: 'ONE_OFF',
                source: 'MANUAL'
            }
        };

        const result = computePayroll([event], [mockTeacher], 't1', '2026-05-01T00:00:00.000Z', '2026-05-31T23:59:59.000Z');

        expect(result.grossTotalPay).toBe(500);
        expect(result.breakdown[0].pay).toBe(500);
    });

    it('Test 2: One-Off Without Teacher Goes to Organization', () => {
        const event: CalendarEvent = {
            ...baseEvent,
            teacherId: undefined, // No teacher assigned
            overrideFlags: {
                paymentMethod: 'ONE_OFF'
            },
            pricingSnapshot: {
                rateValue: 500,
                rateType: 'ONE_OFF',
                source: 'MANUAL'
            }
        };

        const teacherResult = computePayroll([event], [mockTeacher], 't1', '2026-05-01T00:00:00.000Z', '2026-05-31T23:59:59.000Z');
        expect(teacherResult.grossTotalPay).toBe(0); // unaltered

        const orgResult = computePayroll([event], [mockTeacher], null, '2026-05-01T00:00:00.000Z', '2026-05-31T23:59:59.000Z');
        expect(orgResult.grossTotalPay).toBe(500); // Org receives it
    });

    it('Test 3: One-Off With No Position Still Included', () => {
        const event: CalendarEvent = {
            ...baseEvent,
            positionId: undefined, // Missing position
            overrideFlags: {
                paymentMethod: 'ONE_OFF'
            },
            pricingSnapshot: {
                rateValue: 500,
                rateType: 'ONE_OFF',
                source: 'MANUAL'
            }
        };

        const result = computePayroll([event], [mockTeacher], 't1', '2026-05-01T00:00:00.000Z', '2026-05-31T23:59:59.000Z');

        expect(result.grossTotalPay).toBe(500);
        // Grouped under classification instead of position
        expect(result.breakdown[0].category).toBe('Other');
        expect(result.breakdown[0].pay).toBe(500);
    });
});
