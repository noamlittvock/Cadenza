// ──────────────────────────────────────────────
// utils/financialAggregator.ts — Phase 1: Dynamic Aggregation Engine
// ──────────────────────────────────────────────
//
// This is the "query engine" for the Chart Builder. It replaces the hardcoded
// useMemo chains in FinancialDashboard with a dynamic, config-driven pipeline.
//
// Used by: ChartRenderer (Phase 2), ChartBuilderModal preview (Phase 3),
// and could eventually replace the inline aggregation in FinancialDashboard.
// ──────────────────────────────────────────────

import { CalendarEvent, Teacher, PositionAssignment } from '../types';
import { DimensionId, MetricId, AggregationFn, MetricSelection, ChartFilters } from '../types/chartBuilder';

/** A single row of aggregated output — one per dimension group */
export interface AggregatedRow {
    /** The group label (e.g., teacher name, month string, category) */
    dimensionLabel: string;
    /** Raw dimension value for sorting/linking */
    dimensionValue: string;
    /** Computed metric values keyed by "metricId:aggregation" */
    values: Record<string, number>;
}

/** Input config for the aggregation engine (subset of ChartConfiguration) */
export interface AggregationConfig {
    dimension: DimensionId;
    metrics: MetricSelection[];
    chartFilters?: ChartFilters;
    sort?: {
        by: 'dimension' | MetricId;
        direction: 'asc' | 'desc';
    };
    limit?: {
        topN: number;
        otherLabel?: string;
    };
}

// ── Helpers ──

/** Resolve teacher and position assignment for an event */
function resolveContext(
    event: CalendarEvent,
    teacherMap: Map<string, Teacher>
): { teacher: Teacher | undefined; posAssignment: PositionAssignment | undefined } {
    const teacher = teacherMap.get(event.teacherId);
    const posAssignment =
        teacher?.positionAssignments.find(pa => pa.id === event.positionId)
        ?? teacher?.positionAssignments[0];
    return { teacher, posAssignment };
}

/** Calculate event duration in hours */
function eventDurationHours(event: CalendarEvent): number {
    return (new Date(event.end).getTime() - new Date(event.start).getTime()) / 3_600_000;
}

/**
 * Extract the dimension value from an event + teacher context.
 * This is the "GROUP BY" key extractor.
 */
function extractDimensionValue(
    dimension: DimensionId,
    event: CalendarEvent,
    teacher: Teacher | undefined,
    posAssignment: PositionAssignment | undefined,
    roomNameLookup?: Map<string, string>
): string {
    switch (dimension) {
        case 'teacher':
            return teacher?.fullName ?? 'Unknown';
        case 'position':
            return posAssignment?.positionName ?? 'Unassigned';
        case 'category':
            return posAssignment?.category ?? event.classification ?? 'Other';
        case 'tag':
            // Events can map to multiple tags via teacher — use first for grouping
            return teacher?.tags?.[0] ?? 'Untagged';
        case 'rateType':
            return posAssignment?.rateType ?? 'UNKNOWN';
        case 'month': {
            const d = new Date(event.start);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }
        case 'week': {
            const d = new Date(event.start);
            const startOfYear = new Date(d.getFullYear(), 0, 1);
            const weekNum = Math.ceil(
                ((d.getTime() - startOfYear.getTime()) / 86_400_000 + startOfYear.getDay() + 1) / 7
            );
            return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
        }
        case 'dayOfWeek': {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return days[new Date(event.start).getDay()];
        }
        case 'room':
            return roomNameLookup?.get(event.roomId) ?? event.roomId;
        case 'classification':
            return event.classification;
        default:
            return 'Unknown';
    }
}

// ── Internal group structure ──

interface EventGroup {
    events: CalendarEvent[];
    teacherIds: Set<string>;
    posAssignments: PositionAssignment[];
}

// ── Metric computation ──

/**
 * Compute a single metric value for a group of events.
 */
function computeMetric(
    metricId: MetricId,
    aggregation: AggregationFn,
    group: EventGroup
): number {
    const { events, teacherIds, posAssignments } = group;
    let rawValues: number[];

    switch (metricId) {
        case 'activeHours':
            rawValues = events.filter(e => !e.isCanceled).map(eventDurationHours);
            break;

        case 'canceledHours':
            rawValues = events.filter(e => e.isCanceled).map(eventDurationHours);
            break;

        case 'totalHours':
            rawValues = events.map(eventDurationHours);
            break;

        case 'hourlyCost':
            rawValues = events.filter(e => !e.isCanceled).map(e => {
                const pa = posAssignments.find(p => p.id === e.positionId);
                if (pa?.rateType === 'HOURLY') {
                    return eventDurationHours(e) * pa.rateValue;
                }
                return 0;
            });
            break;

        case 'globalCost': {
            const seen = new Set<string>();
            rawValues = posAssignments
                .filter(pa => {
                    if (pa.rateType !== 'GLOBAL_MONTHLY' || seen.has(pa.id)) return false;
                    seen.add(pa.id);
                    return true;
                })
                .map(pa => pa.rateValue);
            break;
        }

        case 'totalCost': {
            const eventBasedCost = events.filter(e => !e.isCanceled).reduce((sum, e) => {
                const pa = posAssignments.find(p => p.id === e.positionId);
                if (pa?.rateType === 'HOURLY') {
                    return sum + eventDurationHours(e) * pa.rateValue;
                } else if (pa?.rateType === 'PER_EVENT') {
                    return sum + pa.rateValue;
                }
                return sum;
            }, 0);
            const seenGlobal = new Set<string>();
            const global = posAssignments
                .filter(pa => {
                    if (pa.rateType !== 'GLOBAL_MONTHLY' || seenGlobal.has(pa.id)) return false;
                    seenGlobal.add(pa.id);
                    return true;
                })
                .reduce((s, pa) => s + pa.rateValue, 0);
            rawValues = [eventBasedCost + global];
            break;
        }

        case 'eventCount':
            rawValues = [events.length];
            break;

        case 'teacherCount':
            rawValues = [teacherIds.size];
            break;

        case 'avgRate':
            rawValues = posAssignments.map(pa => pa.rateValue);
            break;

        default:
            rawValues = [];
    }

    // Apply aggregation function
    if (rawValues.length === 0) return 0;

    switch (aggregation) {
        case 'SUM':
            return rawValues.reduce((a, b) => a + b, 0);
        case 'AVG':
            return rawValues.reduce((a, b) => a + b, 0) / rawValues.length;
        case 'COUNT':
            return rawValues.length;
        case 'COUNT_DISTINCT':
            return new Set(rawValues).size;
        case 'MIN':
            return Math.min(...rawValues);
        case 'MAX':
            return Math.max(...rawValues);
        default:
            return 0;
    }
}

// ── Main Aggregation Pipeline ──

/**
 * Main aggregation engine: processes filtered events into chart-ready data.
 *
 * Pipeline: Group by Dimension → Compute Metrics → Sort → Limit (Top-N)
 *
 * @param events     Pre-filtered events (date range + advanced filters already applied)
 * @param teachers   Full teacher list (for lookups)
 * @param config     Aggregation configuration (dimension, metrics, sort, limit)
 * @param roomNameLookup  Optional map of roomId → room name for display
 */
export function aggregateByDimension(
    events: CalendarEvent[],
    teachers: Teacher[],
    config: AggregationConfig,
    roomNameLookup?: Map<string, string>
): AggregatedRow[] {
    const teacherMap = new Map(teachers.map(t => [t.id, t]));

    // ── Phase 0: Apply chart-level filters (multi-dimensional narrowing) ──
    let filteredInput = events;
    if (config.chartFilters) {
        const cf = config.chartFilters;
        filteredInput = events.filter(event => {
            if (event.isHidden) return false;
            const teacher = teacherMap.get(event.teacherId);
            const posAssignment =
                teacher?.positionAssignments.find(pa => pa.id === event.positionId)
                ?? teacher?.positionAssignments[0];

            // Teacher filter
            if (cf.teacherIds.length > 0 && !cf.teacherIds.includes(event.teacherId)) return false;

            // Position filter
            if (cf.positionNames.length > 0) {
                const posName = posAssignment?.positionName ?? '';
                if (!cf.positionNames.includes(posName)) return false;
            }

            // Tag filter (teacher must have at least one of the selected tags)
            if (cf.tags.length > 0) {
                const teacherTags = teacher?.tags ?? [];
                if (!cf.tags.some(t => teacherTags.includes(t))) return false;
            }

            // Category filter
            if (cf.categories.length > 0) {
                const cat = posAssignment?.category ?? event.classification ?? '';
                if (!cf.categories.includes(cat)) return false;
            }

            // Rate type filter
            if (cf.rateTypes.length > 0) {
                const rt = posAssignment?.rateType ?? '';
                if (!cf.rateTypes.includes(rt)) return false;
            }

            return true;
        });
    }

    // ── Phase 1: Group events by dimension ──
    const groups = new Map<string, EventGroup>();

    for (const event of filteredInput) {
        if (event.isHidden) continue;

        const { teacher, posAssignment } = resolveContext(event, teacherMap);
        const dimValue = extractDimensionValue(
            config.dimension, event, teacher, posAssignment, roomNameLookup
        );

        if (!groups.has(dimValue)) {
            groups.set(dimValue, { events: [], teacherIds: new Set(), posAssignments: [] });
        }
        const group = groups.get(dimValue)!;
        group.events.push(event);
        if (teacher) group.teacherIds.add(teacher.id);
        if (posAssignment) group.posAssignments.push(posAssignment);
    }

    // ── Phase 2: Compute metrics per group ──
    const rows: AggregatedRow[] = [];

    for (const [dimValue, group] of groups) {
        const values: Record<string, number> = {};

        for (const { metricId, aggregation } of config.metrics) {
            const key = `${metricId}:${aggregation}`;
            values[key] = computeMetric(metricId, aggregation, group);
        }

        rows.push({
            dimensionLabel: dimValue,
            dimensionValue: dimValue,
            values,
        });
    }

    // ── Phase 3: Sort ──
    if (config.sort) {
        const { by, direction } = config.sort;
        const sortMetricKey = by === 'dimension'
            ? null
            : `${by}:${config.metrics.find(m => m.metricId === by)?.aggregation ?? 'SUM'}`;

        rows.sort((a, b) => {
            let cmp: number;
            if (sortMetricKey) {
                cmp = (a.values[sortMetricKey] ?? 0) - (b.values[sortMetricKey] ?? 0);
            } else {
                cmp = a.dimensionLabel.localeCompare(b.dimensionLabel);
            }
            return direction === 'desc' ? -cmp : cmp;
        });
    }

    // ── Phase 4: Limit (Top-N) ──
    if (config.limit && rows.length > config.limit.topN) {
        const topRows = rows.slice(0, config.limit.topN);
        const otherRows = rows.slice(config.limit.topN);

        // Aggregate "Other" bucket
        const otherValues: Record<string, number> = {};
        const allKeys = Object.keys(topRows[0]?.values ?? {});
        for (const key of allKeys) {
            otherValues[key] = otherRows.reduce((sum, r) => sum + (r.values[key] ?? 0), 0);
        }

        topRows.push({
            dimensionLabel: config.limit.otherLabel ?? 'Other',
            dimensionValue: '__other__',
            values: otherValues,
        });

        return topRows;
    }

    return rows;
}
