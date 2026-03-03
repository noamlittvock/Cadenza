// ──────────────────────────────────────────────
// components/ChartRenderer.tsx — Chart Rendering with Typography & Value Highlighting
// ──────────────────────────────────────────────
//
// Takes a ChartConfiguration + pre-filtered events/teachers and renders
// the appropriate Recharts chart (Bar, Stacked Bar, Line, Pie, or Table).
//
// Features:
// - Responsive typography with clear visual hierarchy
// - Min/max value highlighting (green for max, red for min)
// - All data aggregation via aggregateByDimension() engine
// ──────────────────────────────────────────────

import React, { useMemo } from 'react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import { CalendarEvent, Teacher, Activity } from '../types';
import { ChartConfiguration, MetricSelection } from '../types/chartBuilder';
import { aggregateByDimension, AggregationConfig } from '../utils/financialAggregator';
import { DIMENSION_REGISTRY, METRIC_REGISTRY } from '../chartBuilder/smartDefaults';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import { formatHours, formatCurrency } from '../utils/formatters';
import { TRANSLATIONS } from '../constants';

const t = (key: string) => {
    const lang = document.documentElement.lang || 'en-US';
    return (TRANSLATIONS as any)[lang]?.[key] || (TRANSLATIONS as any)['en-US']?.[key] || key;
};

// ── Color palette matching existing dashboard style ──

const CHART_COLORS = [
    '#4f46e5', // cadenza-light
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f97316', // orange
    '#6366f1', // indigo
    '#64748b', // slate
];

// ── Helpers ──

/** Build a display-friendly key for a metric selection */
function metricDisplayKey(m: MetricSelection): string {
    if (m.label) return m.label;
    const meta = METRIC_REGISTRY[m.metricId];
    const label = meta?.label ?? m.metricId;
    return `${label} (${m.aggregation.toLowerCase()})`;
}

/** Get the color for a metric at a given index */
function metricColor(m: MetricSelection, index: number): string {
    return m.color ?? CHART_COLORS[index % CHART_COLORS.length];
}

/** Format a number value for display */
function formatValue(val: number): string {
    return val.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** Smart format: use H:MM for hour metrics, currency formatting for cost metrics, decimal for others */

/** Smart format: use H:MM for hour metrics, currency formatting for cost metrics, decimal for others */
function formatValueForKey(val: number, dataKey: string, metrics?: MetricSelection[], currencySymbol: string = '₪'): string {
    if (metrics) {
        for (const m of metrics) {
            const displayKey = metricDisplayKey(m);
            if (dataKey === displayKey || dataKey.endsWith(`__${displayKey}`)) {
                const meta = METRIC_REGISTRY[m.metricId];
                if (meta?.unit === 'hours') return formatHours(val);
                if (meta?.unit === 'currency') return formatCurrency(val, currencySymbol);
            }
        }
    }
    return formatValue(val);
}

// ── Min/Max detection ──

interface MinMaxMap {
    /** For each metric key, the min and max numeric values */
    [metricKey: string]: { min: number; max: number };
}

function computeMinMax(
    chartData: Record<string, string | number>[],
    metricKeys: string[]
): MinMaxMap {
    const result: MinMaxMap = {};
    for (const key of metricKeys) {
        let min = Infinity;
        let max = -Infinity;
        for (const row of chartData) {
            const val = typeof row[key] === 'number' ? (row[key] as number) : 0;
            if (val < min) min = val;
            if (val > max) max = val;
        }
        result[key] = { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
    }
    return result;
}

function isMinValue(val: number, key: string, minMax: MinMaxMap): boolean {
    return minMax[key] && val === minMax[key].min && minMax[key].min !== minMax[key].max;
}

function isMaxValue(val: number, key: string, minMax: MinMaxMap): boolean {
    return minMax[key] && val === minMax[key].max && minMax[key].min !== minMax[key].max;
}

// ── Responsive typography sizing based on data density ──

interface TypographyConfig {
    axisTick: number;
    axisLabel: number;
    legend: number;
    tooltip: number;
    xAxisAngle: number;
    xAxisAnchor: 'middle' | 'end';
    xAxisHeight: number;
    marginBottom: number;
}

function getTypography(dataPointCount: number, height: number): TypographyConfig {
    const isCompact = height < 300;
    const isDense = dataPointCount > 12;
    const isMedium = dataPointCount > 6;

    return {
        axisTick: isCompact ? 9 : isDense ? 10 : 11,
        axisLabel: isCompact ? 10 : 12,
        legend: isCompact ? 10 : 12,
        tooltip: 12,
        xAxisAngle: isDense ? -45 : isMedium ? -25 : 0,
        xAxisAnchor: isDense || isMedium ? 'end' : 'middle',
        xAxisHeight: isDense ? 70 : isMedium ? 50 : 35,
        marginBottom: isDense ? 10 : 5,
    };
}

// ── Shared Tooltip Style ──

const TOOLTIP_STYLE: React.CSSProperties = {
    backgroundColor: '#1e293b',
    border: 'none',
    color: '#fff',
    borderRadius: '10px',
    fontSize: '12px',
    padding: '10px 14px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

// ── Custom tooltip with min/max coloring ──

interface HighlightTooltipProps {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string; dataKey: string }>;
    label?: string;
    minMax: MinMaxMap;
    configMetrics?: MetricSelection[];
    currencySymbol?: string;
}

const HighlightTooltip: React.FC<HighlightTooltipProps> = ({ active, payload, label, minMax, configMetrics, currencySymbol }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={TOOLTIP_STYLE}>
            <p style={{ fontWeight: 600, marginBottom: 4, fontSize: 13, color: '#e2e8f0' }}>{label}</p>
            {payload.map((entry, i) => {
                const isMax = isMaxValue(entry.value, entry.dataKey, minMax);
                const isMin = isMinValue(entry.value, entry.dataKey, minMax);
                return (
                    <p key={i} style={{
                        margin: '2px 0',
                        fontSize: 12,
                        color: isMax ? '#4ade80' : isMin ? '#f87171' : '#cbd5e1',
                        fontWeight: isMax || isMin ? 700 : 400,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                    }}>
                        <span style={{
                            display: 'inline-block', width: 8, height: 8,
                            borderRadius: '50%', backgroundColor: entry.color,
                        }} />
                        {entry.name}: {formatValueForKey(entry.value, entry.dataKey, configMetrics, currencySymbol)}
                        {isMax && ' ▲'}
                        {isMin && ' ▼'}
                    </p>
                );
            })}
        </div>
    );
};

// ── Custom renderers for visible min/max ──

/** Custom bar cell that highlights min/max with colored borders */
const MinMaxBarCell: React.FC<any> = (props) => {
    const { x, y, width, height: h, fill, payload, dataKey, minMax } = props;
    if (!payload || !dataKey || !minMax) {
        return <rect x={x} y={y} width={width} height={h} fill={fill} rx={4} ry={4} />;
    }
    const val = typeof payload[dataKey] === 'number' ? payload[dataKey] : 0;
    const isMax = isMaxValue(val, dataKey, minMax);
    const isMin = isMinValue(val, dataKey, minMax);

    return (
        <g>
            <rect x={x} y={y} width={width} height={h} fill={fill} rx={4} ry={4}
                opacity={isMax || isMin ? 1 : 0.85} />
            {isMax && <rect x={x} y={y} width={width} height={h} fill="none" stroke="#22c55e" strokeWidth={2.5} rx={4} ry={4} />}
            {isMin && <rect x={x} y={y} width={width} height={h} fill="none" stroke="#ef4444" strokeWidth={2.5} rx={4} ry={4} />}
        </g>
    );
};

/** Custom label on bars that colors min/max values */
const MinMaxBarLabel: React.FC<any> = (props) => {
    const { x, y, width, value, dataKey, minMax, configMetrics } = props;
    if (value === undefined || value === null || value === 0) return null;
    const isMax = minMax && isMaxValue(value, dataKey, minMax);
    const isMin = minMax && isMinValue(value, dataKey, minMax);
    if (!isMax && !isMin) return null;

    return (
        <text
            x={x + width / 2} y={y - 6}
            textAnchor="middle"
            fontSize={10}
            fontWeight={700}
            fill={isMax ? '#22c55e' : '#ef4444'}
        >
            {isMax ? '▲ ' : '▼ '}{formatValueForKey(value, dataKey, configMetrics)}
        </text>
    );
};

/** Custom dot renderer for line charts that highlights min/max */
const MinMaxDot: React.FC<any> = (props) => {
    const { cx, cy, dataKey, payload, minMax, fill, configMetrics } = props;
    if (!payload || !dataKey || !minMax || cx == null || cy == null) return null;
    const val = typeof payload[dataKey] === 'number' ? payload[dataKey] : 0;
    const isMax = isMaxValue(val, dataKey, minMax);
    const isMin = isMinValue(val, dataKey, minMax);

    if (isMax || isMin) {
        const color = isMax ? '#22c55e' : '#ef4444';
        return (
            <g>
                <circle cx={cx} cy={cy} r={7} fill={color} opacity={0.15} />
                <circle cx={cx} cy={cy} r={5} fill="#fff" stroke={color} strokeWidth={2.5} />
                <text x={cx} y={cy - 12} textAnchor="middle" fontSize={9} fontWeight={700} fill={color}>
                    {isMax ? '▲' : '▼'} {formatValueForKey(val, dataKey, configMetrics)}
                </text>
            </g>
        );
    }
    return <circle cx={cx} cy={cy} r={3} fill={fill} strokeWidth={0} />;
};

// ── Sub-renderers ──

interface InternalChartProps {
    chartData: Record<string, string | number>[];
    metricKeys: string[];
    colors: string[];
    height: number;
    config: ChartConfiguration;
    minMax: MinMaxMap;
    currencySymbol?: string;
}

const BarChartRenderer: React.FC<InternalChartProps> = ({ chartData, metricKeys, colors, height, config, minMax, currencySymbol }) => {
    const typo = getTypography(chartData.length, height);

    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={chartData} margin={{ top: 8, right: 20, bottom: typo.marginBottom, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.15)" />
                <XAxis
                    dataKey="name"
                    fontSize={typo.axisTick}
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: typo.axisTick }}
                    tickLine={{ stroke: '#64748b' }}
                    interval={0}
                    angle={typo.xAxisAngle}
                    textAnchor={typo.xAxisAnchor}
                    height={typo.xAxisHeight}
                />
                <YAxis
                    fontSize={typo.axisTick}
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: typo.axisTick }}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                />
                <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    content={<HighlightTooltip minMax={minMax} configMetrics={config.metrics} currencySymbol={currencySymbol} />}
                />
                <Legend
                    wrapperStyle={{ fontSize: `${typo.legend}px`, paddingTop: '8px' }}
                    iconSize={10}
                    iconType="circle"
                />
                {metricKeys.map((key, i) => (
                    <Bar
                        key={key}
                        dataKey={key}
                        stackId={config.visualization === 'stacked-bar' ? 'stack' : undefined}
                        fill={colors[i]}
                        radius={
                            config.visualization === 'stacked-bar'
                                ? (i === metricKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0])
                                : [4, 4, 0, 0]
                        }
                        shape={<MinMaxBarCell minMax={minMax} dataKey={key} />}
                    >
                        <LabelList
                            dataKey={key}
                            position="top"
                            content={<MinMaxBarLabel dataKey={key} minMax={minMax} configMetrics={config.metrics} />}
                        />
                    </Bar>
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
};

const LineChartRenderer: React.FC<InternalChartProps> = ({ chartData, metricKeys, colors, height, config, minMax, currencySymbol }) => {
    const typo = getTypography(chartData.length, height);

    return (
        <ResponsiveContainer width="100%" height={height}>
            <LineChart data={chartData} margin={{ top: 8, right: 20, bottom: typo.marginBottom, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.15)" />
                <XAxis
                    dataKey="name"
                    fontSize={typo.axisTick}
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: typo.axisTick }}
                    tickLine={{ stroke: '#64748b' }}
                    angle={typo.xAxisAngle}
                    textAnchor={typo.xAxisAnchor}
                    height={typo.xAxisHeight}
                />
                <YAxis
                    fontSize={typo.axisTick}
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: typo.axisTick }}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                />
                <Tooltip content={<HighlightTooltip minMax={minMax} configMetrics={config.metrics} currencySymbol={currencySymbol} />} />
                <Legend
                    wrapperStyle={{ fontSize: `${typo.legend}px`, paddingTop: '8px' }}
                    iconSize={10}
                    iconType="circle"
                />
                {metricKeys.map((key, i) => (
                    <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={colors[i]}
                        strokeWidth={2.5}
                        dot={<MinMaxDot dataKey={key} minMax={minMax} fill={colors[i]} configMetrics={config.metrics} />}
                        activeDot={{ r: 6, stroke: colors[i], strokeWidth: 2, fill: '#fff' }}
                    />
                ))}
            </LineChart>
        </ResponsiveContainer>
    );
};

const PieChartRenderer: React.FC<InternalChartProps> = ({ chartData, metricKeys, height, minMax, config, currencySymbol }) => {
    const metricKey = metricKeys[0];
    const outerRadius = Math.min(height * 0.35, 130);
    const isCompact = height < 300;

    return (
        <ResponsiveContainer width="100%" height={height}>
            <PieChart>
                <Pie
                    data={chartData}
                    dataKey={metricKey}
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={outerRadius}
                    innerRadius={outerRadius * 0.55}
                    paddingAngle={2}
                    label={({ name, percent, value }) => {
                        const val = value as number;
                        const isMax = isMaxValue(val, metricKey, minMax);
                        const isMin = isMinValue(val, metricKey, minMax);
                        const suffix = isMax ? ' ▲' : isMin ? ' ▼' : '';
                        return `${name} ${(percent * 100).toFixed(0)}%${suffix}`;
                    }}
                    labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                    fontSize={isCompact ? 9 : 11}
                >
                    {chartData.map((row, i) => {
                        const val = typeof row[metricKey] === 'number' ? (row[metricKey] as number) : 0;
                        const isMax = isMaxValue(val, metricKey, minMax);
                        const isMin = isMinValue(val, metricKey, minMax);
                        return (
                            <Cell
                                key={i}
                                fill={isMax ? '#22c55e' : isMin ? '#ef4444' : CHART_COLORS[i % CHART_COLORS.length]}
                                stroke={isMax ? '#16a34a' : isMin ? '#dc2626' : 'none'}
                                strokeWidth={isMax || isMin ? 2 : 0}
                            />
                        );
                    })}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatValueForKey(value as number, metricKey, config.metrics, currencySymbol)} />
                <Legend
                    wrapperStyle={{ fontSize: isCompact ? '10px' : '12px', paddingTop: '4px' }}
                    iconSize={10}
                    iconType="circle"
                />
            </PieChart>
        </ResponsiveContainer>
    );
};

const TableRenderer: React.FC<InternalChartProps> = ({ chartData, metricKeys, config, minMax, currencySymbol }) => {
    const [sortCol, setSortCol] = React.useState<string | null>(null);
    const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');

    const dimLabel = DIMENSION_REGISTRY[config.dimension]?.label ?? config.dimension;

    const sorted = useMemo(() => {
        if (!sortCol) return chartData;
        return [...chartData].sort((a, b) => {
            const aVal = sortCol === '__name__' ? (a.name as string) : (a[sortCol] as number ?? 0);
            const bVal = sortCol === '__name__' ? (b.name as string) : (b[sortCol] as number ?? 0);
            const cmp = typeof aVal === 'number' ? aVal - (bVal as number) : (aVal as string).localeCompare(bVal as string);
            return sortDir === 'desc' ? -cmp : cmp;
        });
    }, [chartData, sortCol, sortDir]);

    const handleSort = (col: string) => {
        if (sortCol === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(col);
            setSortDir('desc');
        }
    };

    const SortIcon: React.FC<{ col: string }> = ({ col }) => {
        if (sortCol !== col) return <ChevronDown size={10} className="text-slate-400 dark:text-slate-500 ms-1 inline" />;
        return sortDir === 'asc'
            ? <ChevronUp size={10} className="text-blue-500 dark:text-blue-400 ms-1 inline" />
            : <ChevronDown size={10} className="text-blue-500 dark:text-blue-400 ms-1 inline" />;
    };

    /** Get the CSS class for a cell based on whether it's min, max, or neither */
    const getCellStyle = (val: number, key: string): string => {
        if (isMaxValue(val, key, minMax)) return 'font-bold text-emerald-500 dark:text-emerald-400';
        if (isMinValue(val, key, minMax)) return 'font-bold text-red-500 dark:text-red-400';
        return 'text-slate-600 dark:text-slate-400';
    };

    return (
        <div className="overflow-x-auto max-h-96 overflow-y-auto custom-scrollbar">
            <table className="w-full text-start text-sm">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-medium sticky top-0 z-10">
                    <tr>
                        <th
                            className="px-4 py-3 text-xs uppercase tracking-wider cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                            onClick={() => handleSort('__name__')}
                        >
                            {dimLabel} <SortIcon col="__name__" />
                        </th>
                        {metricKeys.map(k => (
                            <th
                                key={k}
                                className="px-4 py-3 text-end text-xs uppercase tracking-wider cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                                onClick={() => handleSort(k)}
                            >
                                {k} <SortIcon col={k} />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sorted.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">
                                {row.name}
                            </td>
                            {metricKeys.map(k => {
                                const val = typeof row[k] === 'number' ? (row[k] as number) : 0;
                                const cellClass = getCellStyle(val, k);
                                const isMax = isMaxValue(val, k, minMax);
                                const isMin = isMinValue(val, k, minMax);
                                return (
                                    <td key={k} className={`px-4 py-2.5 text-end tabular-nums ${cellClass}`}>
                                        <span className="inline-flex items-center gap-1">
                                            {typeof row[k] === 'number' ? formatValueForKey(row[k] as number, k, config.metrics, currencySymbol) : row[k]}
                                            {isMax && <TrendingUp size={12} className="text-emerald-500" />}
                                            {isMin && <TrendingDown size={12} className="text-red-500" />}
                                        </span>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
                {/* Totals row */}
                <tfoot className="bg-slate-100 dark:bg-slate-950 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                        <td className="px-4 py-3 text-slate-800 dark:text-white text-xs uppercase tracking-wider">{t('col.total')}</td>
                        {metricKeys.map(k => {
                            const total = sorted.reduce((sum, row) => sum + (typeof row[k] === 'number' ? row[k] as number : 0), 0);
                            return (
                                <td key={k} className="px-4 py-3 text-end text-slate-800 dark:text-white tabular-nums">
                                    {formatValueForKey(total, k, config.metrics, currencySymbol)}
                                </td>
                            );
                        })}
                    </tr>
                </tfoot>
            </table>
        </div>
    );
};

// ── Main Exported Component ──

interface ChartRendererProps {
    /** The chart configuration to render */
    config: ChartConfiguration;
    /** Pre-filtered events (date range + advanced filters already applied) */
    events: CalendarEvent[];
    /** Full teacher list for lookups */
    teachers: Teacher[];
    /** Optional room name lookup map */
    roomNameLookup?: Map<string, string>;
    /** Chart container height in px (default: 350) */
    height?: number;
    currencySymbol?: string;
    /** Activity list for resolving activityId → name */
    activities?: Activity[];
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
    config,
    events,
    teachers,
    roomNameLookup,
    height = 350,
    currencySymbol = '₪',
    activities,
}) => {
    // ── Run the aggregation engine (Phase 1) ──
    const aggregationConfig: AggregationConfig = useMemo(() => ({
        dimension: config.dimension,
        metrics: config.metrics,
        chartFilters: config.chartFilters,
        sort: config.sort,
        limit: config.limit,
    }), [config.dimension, config.metrics, config.chartFilters, config.sort, config.limit]);

    const aggregatedData = useMemo(
        () => aggregateByDimension(events, teachers, aggregationConfig, roomNameLookup, activities),
        [events, teachers, aggregationConfig, roomNameLookup, activities]
    );

    // ── Reshape into Recharts-friendly format ──
    const metricKeys = useMemo(
        () => config.metrics.map(m => metricDisplayKey(m)),
        [config.metrics]
    );

    const colors = useMemo(
        () => config.metrics.map((m, i) => metricColor(m, i)),
        [config.metrics]
    );

    const chartData = useMemo(() => {
        return aggregatedData.map(row => {
            const point: Record<string, string | number> = { name: row.dimensionLabel };
            config.metrics.forEach(m => {
                const key = `${m.metricId}:${m.aggregation}`;
                const displayKey = metricDisplayKey(m);
                point[displayKey] = Math.round((row.values[key] ?? 0) * 100) / 100;
            });
            return point;
        });
    }, [aggregatedData, config.metrics]);

    // ── Compute min/max per metric for highlighting ──
    const minMax = useMemo(() => computeMinMax(chartData, metricKeys), [chartData, metricKeys]);

    // ── Empty state ──
    if (chartData.length === 0) {
        return (
            <div className="flex items-center justify-center text-slate-400 dark:text-slate-600 py-12">
                <div className="text-center">
                    <div className="text-3xl mb-2">📊</div>
                    <div className="text-sm">{t('chart.no_data_filters')}</div>
                </div>
            </div>
        );
    }

    // ── Props shared by all chart sub-renderers ──
    const internalProps: InternalChartProps = {
        chartData,
        metricKeys,
        colors,
        height,
        config,
        minMax,
        currencySymbol,
    };

    // ── Render the correct visualization ──
    switch (config.visualization) {
        case 'bar':
        case 'stacked-bar':
            return <BarChartRenderer {...internalProps} />;
        case 'line':
            return <LineChartRenderer {...internalProps} />;
        case 'pie':
            return <PieChartRenderer {...internalProps} />;
        case 'table':
            return <TableRenderer {...internalProps} />;
        default:
            return (
                <div className="text-slate-500 dark:text-slate-400 p-4 text-sm text-center">
                    Unsupported visualization type: {config.visualization}
                </div>
            );
    }
};
