// ──────────────────────────────────────────────
// chartBuilder/smartDefaults.ts — Dimension Registry + Smart Default Engine
// ──────────────────────────────────────────────

import { DimensionId, MetricSelection, VisualizationType } from '../types/chartBuilder';

/** Metadata about each available dimension */
export interface DimensionMeta {
    id: DimensionId;
    label: string;
    isTemporal: boolean;
    /** Estimated cardinality — affects chart type recommendations */
    estimatedCardinality: 'low' | 'medium' | 'high';
}

/** Registry of all dimensions with their characteristics */
export const DIMENSION_REGISTRY: Record<DimensionId, DimensionMeta> = {
    teacher: { id: 'teacher', label: 'Teacher', isTemporal: false, estimatedCardinality: 'medium' },
    position: { id: 'position', label: 'Position', isTemporal: false, estimatedCardinality: 'medium' },
    category: { id: 'category', label: 'Category', isTemporal: false, estimatedCardinality: 'low' },
    tag: { id: 'tag', label: 'Tag', isTemporal: false, estimatedCardinality: 'low' },
    rateType: { id: 'rateType', label: 'Rate Type', isTemporal: false, estimatedCardinality: 'low' },
    month: { id: 'month', label: 'Month', isTemporal: true, estimatedCardinality: 'medium' },
    week: { id: 'week', label: 'Week', isTemporal: true, estimatedCardinality: 'high' },
    dayOfWeek: { id: 'dayOfWeek', label: 'Day of Week', isTemporal: true, estimatedCardinality: 'low' },
    room: { id: 'room', label: 'Room', isTemporal: false, estimatedCardinality: 'low' },
    classification: { id: 'classification', label: 'Classification', isTemporal: false, estimatedCardinality: 'low' },
};

/** All metric options with display labels */
export const METRIC_REGISTRY: Record<string, { id: string; label: string; unit: string }> = {
    activeHours: { id: 'activeHours', label: 'Active Hours', unit: 'hours' },
    canceledHours: { id: 'canceledHours', label: 'Canceled Hours', unit: 'hours' },
    totalHours: { id: 'totalHours', label: 'Total Hours', unit: 'hours' },
    hourlyCost: { id: 'hourlyCost', label: 'Hourly Cost', unit: '₪' },
    globalCost: { id: 'globalCost', label: 'Global Cost', unit: '₪' },
    totalCost: { id: 'totalCost', label: 'Total Cost', unit: '₪' },
    eventCount: { id: 'eventCount', label: 'Event Count', unit: '' },
    teacherCount: { id: 'teacherCount', label: 'Teacher Count', unit: '' },
    avgRate: { id: 'avgRate', label: 'Average Rate', unit: '₪' },
};

/**
 * Returns the set of visualization types that are VALID for a given dimension + metrics combo.
 *
 * Rules:
 * 1. Bar charts — always valid, supports 1 or more metrics side-by-side.
 * 2. Tables — always valid for any configuration.
 * 3. Stacked bars — require 2+ metrics (multi-series stacking).
 * 4. Line charts — ONLY for temporal/chronological dimensions (month, week, dayOfWeek).
 * 5. Pie charts — require exactly 1 metric and non-high cardinality.
 */
export function getCompatibleVisualizations(
    dimension: DimensionId,
    metrics: MetricSelection[],
    secondaryDimension?: DimensionId
): VisualizationType[] {
    const meta = DIMENSION_REGISTRY[dimension];
    const valid: VisualizationType[] = ['bar', 'table'];

    // Stacked bar — needs multiple metrics or a secondary dimension
    if (secondaryDimension || metrics.length > 1) {
        valid.push('stacked-bar');
    }

    // Line charts — ONLY for temporal dimensions (chronological progression)
    if (meta.isTemporal) {
        valid.push('line');
    }

    // Pie charts — single metric and not too-high cardinality
    if (metrics.length === 1 && meta.estimatedCardinality !== 'high') {
        valid.push('pie');
    }

    return valid;
}

/**
 * The "Smart Default" engine:
 * Given a dimension and metrics selection, auto-picks the best visualization type.
 *
 * Logic flow:
 *   Temporal dimension → Line
 *   Low cardinality + single metric → Pie
 *   Multiple metrics → Bar (grouped side-by-side)
 *   Secondary dimension present → Stacked Bar
 *   High cardinality → Table
 *   Default → Bar
 */
export function getSmartDefaultVisualization(
    dimension: DimensionId,
    metrics: MetricSelection[],
    secondaryDimension?: DimensionId
): VisualizationType {
    const meta = DIMENSION_REGISTRY[dimension];

    // Rule 1: Temporal dimension → Line chart
    if (meta.isTemporal && metrics.length <= 3) {
        return 'line';
    }

    // Rule 2: Low cardinality + single metric → Pie chart
    if (meta.estimatedCardinality === 'low' && metrics.length === 1) {
        return 'pie';
    }

    // Rule 3: Secondary dimension present → Stacked bar
    if (secondaryDimension) {
        return 'stacked-bar';
    }

    // Rule 4: High cardinality → Table (too many bars to be readable)
    if (meta.estimatedCardinality === 'high') {
        return 'table';
    }

    // Default: Bar chart (supports multiple metrics side-by-side)
    return 'bar';
}
