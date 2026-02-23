import { RateCard, RateType, RateSnapshot, RateSourceRef, Teacher } from '../types';

export function lookupRate(
    categoryId: string | undefined,
    teacherId: string | undefined,
    positionId: string | undefined,
    dateIso: string,
    rateCards: RateCard[],
    teachers: Teacher[]
): { snapshot: RateSnapshot; ref?: RateSourceRef } | null {
    if (!categoryId) return null;

    const dateStr = dateIso.split('T')[0];

    let bestEntry: any = null;
    let bestCard: RateCard | null = null;
    let score = -1;

    rateCards.forEach(card => {
        card.entries.forEach(entry => {
            if (entry.categoryId !== categoryId) return;
            if (entry.effectiveFrom > dateStr) return;
            if (entry.effectiveTo && entry.effectiveTo < dateStr) return;

            let currentScore = 0;

            let matchedTeacher = false;
            let matchedPosition = false;

            if (entry.teacherId) {
                if (entry.teacherId === teacherId) {
                    currentScore += 10;
                    matchedTeacher = true;
                } else {
                    return; // This rate is for another specific teacher
                }
            }

            if (entry.positionId) {
                if (entry.positionId === positionId) {
                    currentScore += 5;
                    matchedPosition = true;
                } else {
                    return; // This rate is for another specific position
                }
            }

            // If we match exactly what the rate has specified, or it's a generic rate (score 0), we take it
            if (currentScore > score) {
                score = currentScore;
                bestEntry = entry;
                bestCard = card;
            }
        });
    });

    if (bestEntry && bestCard) {
        return {
            snapshot: {
                rateValue: bestEntry.rateValue,
                rateType: bestEntry.rateType as RateType,
                source: 'RATE_CARD'
            },
            ref: {
                rateCardId: bestCard.id,
                rateVersionId: bestCard.versionId,
                effectiveDateUsed: dateStr
            }
        };
    }

    // Fallback: Check if the teacher's positionAssignment provides a manual rate fallback
    if (teacherId && positionId) {
        const teacher = teachers.find(t => t.id === teacherId);
        if (teacher) {
            const pa = teacher.positionAssignments.find(p => p.id === positionId);
            if (pa) {
                return {
                    snapshot: {
                        rateValue: pa.rateValue,
                        rateType: pa.rateType,
                        source: 'MANUAL'
                    }
                };
            }
        }
    }

    return null;
}
