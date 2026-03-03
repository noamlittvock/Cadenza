// ──────────────────────────────────────────────
// types/chartBuilder.ts — Phase 1: Chart Builder Type System
// ──────────────────────────────────────────────

/** Identifies which dimension to group data by */
export type DimensionId =
    | 'teacher'
    | 'position'
    | 'category'
    | 'tag'
    | 'rateType'
    | 'month'
    | 'week'
    | 'dayOfWeek'
    | 'room'
    | 'activity';

/** Available aggregation functions */
export type AggregationFn = 'SUM' | 'AVG' | 'COUNT' | 'COUNT_DISTINCT' | 'MIN' | 'MAX';

/** Identifies which metric to measure */
export type MetricId =
    | 'activeHours'
    | 'canceledHours'
    | 'totalHours'
    | 'hourlyCost'
    | 'globalCost'
    | 'totalCost'
    | 'eventCount'
    | 'teacherCount'
    | 'avgRate';

/** Chart visualization types */
export type VisualizationType = 'bar' | 'stacked-bar' | 'line' | 'pie' | 'table';

/** A single metric selection with its aggregation */
export interface MetricSelection {
    metricId: MetricId;
    aggregation: AggregationFn;
    /** Optional display label override */
    label?: string;
    /** Color override for this metric's series */
    color?: string;
}

/** Sort direction for output data */
export type SortDirection = 'asc' | 'desc';

/** Sorting configuration */
export interface SortConfig {
    /** Sort by dimension label or a metric value */
    by: 'dimension' | MetricId;
    direction: SortDirection;
}

/** Optional limit/top-N configuration */
export interface LimitConfig {
    /** Max number of groups to display */
    topN: number;
    /** How to aggregate the remaining groups */
    otherLabel?: string;
}

/**
 * Snapshot of the dashboard's active filters at the time of chart creation.
 * Allows the chart to either "inherit" the live filters or freeze them.
 */
export interface FilterSnapshot {
    dateFilterType: 'WEEK' | 'MONTH' | 'CUSTOM' | 'ALL';
    customStartDate?: string;
    customEndDate?: string;
    teacherIds: string[];
    positionNames: string[];
    tags: string[];
    categories: string[];
    rateTypes: string[];
}

/**
 * Per-chart multi-dimensional filters.
 * These are independent of the dashboard-level filters and allow
 * cross-referencing — e.g., grouping by Position while filtering
 * to only teachers with a specific tag.
 *
 * Empty arrays = no filter applied for that dimension.
 */
export interface ChartFilters {
    teacherIds: string[];
    positionNames: string[];
    tags: string[];
    categories: string[];
    rateTypes: string[];
}

/**
 * The core, JSON-serializable chart configuration object.
 * This is what gets saved/loaded from localStorage.
 */
export interface ChartConfiguration {
    /** Unique identifier */
    id: string;

    /** User-provided chart title */
    title: string;

    /** Optional description */
    description?: string;

    /**
     * dataSource: Reference to the data pipeline.
     * In this client-only app, this is a constant reference to the
     * FinancialDashboard's internal data pipeline.
     */
    dataSource: 'financial-dashboard';

    /**
     * The "Group By" attribute — determines the X-axis / category labels.
     * An optional secondary dimension enables stacked/grouped charts.
     */
    dimension: DimensionId;
    secondaryDimension?: DimensionId;

    /**
     * The "Aggregate" attributes — determines the Y-axis / values.
     * Multiple metrics can be plotted simultaneously.
     */
    metrics: MetricSelection[];

    /**
     * Visualization type.
     * The Smart Default engine auto-selects this, but the user can override.
     */
    visualization: VisualizationType;

    /** Sorting */
    sort?: SortConfig;

    /** Top-N limiting */
    limit?: LimitConfig;

    /**
     * Filter strategy:
     * - 'live': Chart always uses the current dashboard filter state (reactive).
     * - 'snapshot': Chart freezes the filters captured at creation time.
     */
    filterMode: 'live' | 'snapshot';

    /** Captured filter state (used only when filterMode === 'snapshot') */
    filterSnapshot?: FilterSnapshot;

    /**
     * Per-chart multi-dimensional filters.
     * Applied IN ADDITION to dashboard filters (live) or snapshot filters.
     * Enables cross-referencing: e.g., group by Position, but only for
     * teachers tagged 'Piano' in the 'Strings' category.
     */
    chartFilters?: ChartFilters;

    /**
     * Comparison mode configuration.
     * When enabled, the chart also renders secondary datasets from comparison periods.
     */
    compareEnabled?: boolean;
    compareLayout?: 'side-by-side' | 'merged';
    comparisons?: ComparisonPeriod[];

    /** Creation/modification timestamps */
    createdAt: string;
    updatedAt: string;
}

/** A single comparison period definition */
export interface ComparisonPeriod {
    id: string;
    timeframe: 'currentWeek' | 'currentMonth' | 'specificDay' | 'specificWeek' | 'specificMonth' | 'customRange';
    specificDate?: string;
    customStart?: string;
    customEnd?: string;
}
