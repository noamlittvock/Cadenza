import { CalendarEvent, Teacher } from '../types';

export interface PayrollBreakdown {
    label: string;
    category: string;
    hours: number;
    pay: number;
}

export interface PayrollResult {
    entityId: string;
    entityName: string;
    isOrganization: boolean;
    grossTotalPay: number;
    totalHours: number;
    breakdown: PayrollBreakdown[];
    cancellations: {
        paid: { count: number; pay: number };
        noPay: { count: number; hoursLoss: number };
    };
    addOnsPay: number;
}

export function computePayroll(
    events: CalendarEvent[],
    teachers: Teacher[],
    targetEntityId: string | null, // null means Organization
    monthStartIso: string,
    monthEndIso: string
): PayrollResult {
    const result: PayrollResult = {
        entityId: targetEntityId || 'ORG',
        entityName: targetEntityId ? (teachers.find(t => t.id === targetEntityId)?.fullName || 'Unknown Teacher') : 'Organization',
        isOrganization: targetEntityId === null,
        grossTotalPay: 0,
        totalHours: 0,
        breakdown: [],
        cancellations: {
            paid: { count: 0, pay: 0 },
            noPay: { count: 0, hoursLoss: 0 }
        },
        addOnsPay: 0
    };

    const entityEvents = events.filter(e => {
        if (targetEntityId === null) {
            return !e.teacherId; // No teacher assigned -> Organization
        }
        return e.teacherId === targetEntityId;
    }).filter(e => {
        // Only in the requested month
        const start = new Date(e.start);
        const mStart = new Date(monthStartIso);
        const mEnd = new Date(monthEndIso);
        return start >= mStart && start <= mEnd && !e.isHidden;
    });

    const breakdownMap: Record<string, PayrollBreakdown> = {};

    entityEvents.forEach(evt => {
        // Duration
        const durationHours = (new Date(evt.end).getTime() - new Date(evt.start).getTime()) / (1000 * 60 * 60);

        // Rate rules
        let rateValue = 0;
        let rateType = 'HOURLY';

        // Prefer snapshot, fallback to teacher's positionAssignment or 0
        if (evt.pricingSnapshot) {
            rateValue = evt.pricingSnapshot.rateValue;
            rateType = evt.pricingSnapshot.rateType;
        } else if (targetEntityId && evt.positionId) {
            const teacher = teachers.find(t => t.id === targetEntityId);
            const pa = teacher?.positionAssignments.find(p => p.id === evt.positionId);
            if (pa) {
                rateValue = pa.rateValue;
                rateType = pa.rateType;
            }
        }

        // Hardcoded overrides if override flag is true
        if (evt.overrideFlags?.isRateOverridden) {
            // Just an example, if we wanted manual value stored strictly in the snapshot, we already use that above.
        }

        let eventPay = 0;
        const isNoPayment = evt.overrideFlags?.paymentMethod === 'NONE';
        const isOneOff = evt.overrideFlags?.paymentMethod === 'ONE_OFF' || evt.overrideFlags?.isOneOffPayment;

        if (isNoPayment) {
            eventPay = 0;
        } else if (isOneOff && evt.pricingSnapshot) {
            eventPay = evt.pricingSnapshot.rateValue; // One-Off amount is a flat fee, distinct from hourly rate calculation
        } else if (rateType === 'HOURLY') {
            eventPay = durationHours * rateValue;
        } else if (rateType === 'PER_EVENT') {
            eventPay = rateValue;
        } else {
            // GLOBAL_MONTHLY will be added separately, or we portion it?
            // Usually GLOBAL_MONTHLY is a flat sum paid at end of month, independent of events.
            // But we will calculate it later or assign eventPay = 0 for the individual event.
            eventPay = 0;
        }

        // Cancellations
        if (evt.isCanceled) {
            if (evt.cancellationPayStatus === 'PAID_CANCELLATION') {
                result.cancellations.paid.count += 1;
                result.cancellations.paid.pay += eventPay;
                result.grossTotalPay += eventPay;
                // Still add hours for breakdown? Usually no, but tracked
            } else {
                result.cancellations.noPay.count += 1;
                result.cancellations.noPay.hoursLoss += durationHours;
                eventPay = 0; // Explicitly no pay
            }
        } else {
            result.grossTotalPay += eventPay;
            result.totalHours += durationHours;
        }

        // Addons
        if (evt.addOnItems) {
            evt.addOnItems.forEach(addon => {
                if (addon.affectsPayroll) {
                    result.addOnsPay += addon.amount;
                    result.grossTotalPay += addon.amount;
                }
            });
        }

        // Breakdown aggregation
        const bkKey = evt.categoryId || evt.classification || 'Unclassified';
        if (!breakdownMap[bkKey]) {
            breakdownMap[bkKey] = { label: bkKey, category: bkKey, hours: 0, pay: 0 };
        }

        // Add real event pay to breakdown (only if not canceled or if it's a paid cancellation)
        if (!evt.isCanceled || evt.cancellationPayStatus === 'PAID_CANCELLATION') {
            breakdownMap[bkKey].hours += durationHours;
            breakdownMap[bkKey].pay += eventPay;
        }
    });

    // Global monthly addition
    // If teacher has a global monthly position, add it once per month
    if (targetEntityId) {
        const teacher = teachers.find(t => t.id === targetEntityId);
        if (teacher) {
            teacher.positionAssignments.forEach(pa => {
                if (pa.rateType === 'GLOBAL_MONTHLY') {
                    result.grossTotalPay += pa.rateValue;

                    if (!breakdownMap[pa.category]) {
                        breakdownMap[pa.category] = { label: pa.positionName, category: pa.category, hours: 0, pay: 0 };
                    }
                    breakdownMap[pa.category].pay += pa.rateValue;
                }
            });
        }
    }

    result.breakdown = Object.values(breakdownMap);

    return result;
}
