// ──────────────────────────────────────────────
// components/MergedChartRenderer.tsx — Unified Overlay Comparison Charts
// ──────────────────────────────────────────────
//
// Renders multiple datasets overlaid on a single chart for direct comparison.
// Supports: Bar (grouped), Line (overlaid), Pie (concentric rings), Table.
//
// Features:
// - Shared axis scales across all datasets
// - Hover: highlight one dataset, dim others, expand hovered element
// - Interactive legend with toggle ON/OFF per dataset
// - Min/max highlighting per dataset independently
// - Smooth CSS transitions
// ──────────────────────────────────────────────

import React, { useState, useMemo, useCallback } from 'react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LabelList,
} from 'recharts';
import { CalendarEvent, Teacher } from '../types';
import { ChartConfiguration, MetricSelection } from '../types/chartBuilder';
import { aggregateByDimension, AggregationConfig } from '../utils/financialAggregator';
import { DIMENSION_REGISTRY, METRIC_REGISTRY } from '../chartBuilder/smartDefaults';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import { formatHours } from '../utils/formatters';

// ── Types ──

export interface DatasetInput {
    label: string;
    color: string;
    events: CalendarEvent[];
    isPrimary?: boolean;
}

interface MergedChartRendererProps {
    config: ChartConfiguration;
    datasets: DatasetInput[];
    teachers: Teacher[];
    roomNameLookup?: Map<string, string>;
    height?: number;
}

// ── Helpers ──

function metricDisplayKey(m: MetricSelection): string {
    if (m.label) return m.label;
    const meta = METRIC_REGISTRY[m.metricId];
    const label = meta?.label ?? m.metricId;
    return `${label} (${m.aggregation.toLowerCase()})`;
}

/** Check if a metric key references an hour-unit metric */
function isHourMetric(metricId: string): boolean {
    const meta = METRIC_REGISTRY[metricId];
    return meta?.unit === 'hours';
}

/** Check if a series key (dataset__metricKey) references an hour-unit metric */
function isHourSeriesKey(key: string, metrics: MetricSelection[]): boolean {
    // key format is either "metricKey" or "datasetLabel__metricKey"
    for (const m of metrics) {
        const displayKey = metricDisplayKey(m);
        if (key === displayKey || key.endsWith(`__${displayKey}`)) {
            return isHourMetric(m.metricId);
        }
    }
    return false;
}

function formatValue(val: number): string {
    return val.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function formatValueSmart(val: number, key: string, metrics: MetricSelection[]): string {
    if (isHourSeriesKey(key, metrics)) return formatHours(val);
    return formatValue(val);
}

// ── Min/Max per dataset ──

interface MinMaxEntry { min: number; max: number }

function computeMinMaxForKeys(
    data: Record<string, string | number>[],
    keys: string[]
): Record<string, MinMaxEntry> {
    const result: Record<string, MinMaxEntry> = {};
    for (const key of keys) {
        let min = Infinity, max = -Infinity;
        for (const row of data) {
            const val = typeof row[key] === 'number' ? (row[key] as number) : 0;
            if (val < min) min = val;
            if (val > max) max = val;
        }
        result[key] = { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
    }
    return result;
}

function isMin(val: number, key: string, mm: Record<string, MinMaxEntry>): boolean {
    return mm[key] != null && val === mm[key].min && mm[key].min !== mm[key].max;
}
function isMax(val: number, key: string, mm: Record<string, MinMaxEntry>): boolean {
    return mm[key] != null && val === mm[key].max && mm[key].min !== mm[key].max;
}

// ── Tooltip ──

const TOOLTIP_STYLE: React.CSSProperties = {
    backgroundColor: '#1e293b',
    border: 'none',
    color: '#fff',
    borderRadius: '10px',
    fontSize: '12px',
    padding: '10px 14px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

// ── Typography ──

function getTypography(dataPointCount: number, height: number) {
    const isCompact = height < 300;
    const isDense = dataPointCount > 12;
    const isMedium = dataPointCount > 6;
    return {
        axisTick: isCompact ? 9 : isDense ? 10 : 11,
        legend: isCompact ? 10 : 12,
        xAxisAngle: isDense ? -45 : isMedium ? -25 : 0,
        xAxisAnchor: (isDense || isMedium ? 'end' : 'middle') as 'end' | 'middle',
        xAxisHeight: isDense ? 70 : isMedium ? 50 : 35,
        marginBottom: isDense ? 10 : 5,
    };
}

// ── Main Component ──

export const MergedChartRenderer: React.FC<MergedChartRendererProps> = ({
    config, datasets, teachers, roomNameLookup, height = 380,
}) => {
    // ── State ──
    const [hoveredDataset, setHoveredDataset] = useState<string | null>(null);
    const [hiddenDatasets, setHiddenDatasets] = useState<Set<string>>(new Set());

    const toggleDataset = useCallback((label: string) => {
        setHiddenDatasets(prev => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label); else next.add(label);
            return next;
        });
    }, []);

    // ── Aggregate each dataset ──
    const aggregationConfig: AggregationConfig = useMemo(() => ({
        dimension: config.dimension,
        metrics: config.metrics,
        chartFilters: config.chartFilters,
        sort: config.sort,
        limit: config.limit,
    }), [config]);

    const perDatasetData = useMemo(() => {
        return datasets.map(ds => {
            const rows = aggregateByDimension(ds.events, teachers, aggregationConfig, roomNameLookup);
            return { ...ds, rows };
        });
    }, [datasets, teachers, aggregationConfig, roomNameLookup]);

    // ── Build unified chart data ──
    // Union all dimension labels, then for each label, add values from each dataset
    const { mergedData, seriesKeys, seriesColors, seriesDatasetMap } = useMemo(() => {
        const allLabels = new Set<string>();
        for (const ds of perDatasetData) {
            for (const row of ds.rows) allLabels.add(row.dimensionLabel);
        }
        const sortedLabels = Array.from(allLabels).sort();

        const keys: string[] = [];
        const colors: string[] = [];
        const dsMap: Record<string, string> = {}; // seriesKey -> dataset label

        // For each visible dataset, for each metric, create a series key
        const visibleDatasets = perDatasetData.filter(ds => !hiddenDatasets.has(ds.label));
        for (const ds of visibleDatasets) {
            for (const m of config.metrics) {
                const mKey = metricDisplayKey(m);
                const seriesKey = visibleDatasets.length === 1
                    ? mKey  // If only one dataset, don't prefix
                    : `${ds.label} — ${mKey}`;
                keys.push(seriesKey);
                colors.push(ds.color);
                dsMap[seriesKey] = ds.label;
            }
        }

        // Build merged data rows
        const data = sortedLabels.map(label => {
            const row: Record<string, string | number> = { name: label };
            for (const ds of visibleDatasets) {
                const aggRow = ds.rows.find(r => r.dimensionLabel === label);
                for (const m of config.metrics) {
                    const rawKey = `${m.metricId}:${m.aggregation}`;
                    const mKey = metricDisplayKey(m);
                    const seriesKey = visibleDatasets.length === 1
                        ? mKey
                        : `${ds.label} — ${mKey}`;
                    row[seriesKey] = aggRow
                        ? Math.round((aggRow.values[rawKey] ?? 0) * 100) / 100
                        : 0;
                }
            }
            return row;
        });

        return { mergedData: data, seriesKeys: keys, seriesColors: colors, seriesDatasetMap: dsMap };
    }, [perDatasetData, config.metrics, hiddenDatasets]);

    // ── Min/max per dataset (for each dataset's series keys independently) ──
    const minMaxMap = useMemo(() => {
        const mm: Record<string, MinMaxEntry> = {};
        // Group series keys by dataset
        const byDataset = new Map<string, string[]>();
        for (const key of seriesKeys) {
            const dsLabel = seriesDatasetMap[key];
            if (!byDataset.has(dsLabel)) byDataset.set(dsLabel, []);
            byDataset.get(dsLabel)!.push(key);
        }
        // Compute min/max per dataset's keys
        for (const [, keys] of byDataset) {
            Object.assign(mm, computeMinMaxForKeys(mergedData, keys));
        }
        return mm;
    }, [mergedData, seriesKeys, seriesDatasetMap]);

    // ── Typography ──
    const typo = getTypography(mergedData.length, height);

    // ── Opacity helper ──
    const getSeriesOpacity = useCallback((seriesKey: string): number => {
        if (!hoveredDataset) return 1;
        const belongsTo = seriesDatasetMap[seriesKey];
        return belongsTo === hoveredDataset ? 1 : 0.15;
    }, [hoveredDataset, seriesDatasetMap]);

    // ── Empty state ──
    if (mergedData.length === 0 || seriesKeys.length === 0) {
        return (
            <div className="flex items-center justify-center text-slate-400 dark:text-slate-600 py-12">
                <div className="text-center">
                    <div className="text-3xl mb-2">📊</div>
                    <div className="text-sm">No data matches the current filters</div>
                </div>
            </div>
        );
    }

    // ── Custom Tooltip ──
    const MergedTooltip: React.FC<any> = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        return (
            <div style={TOOLTIP_STYLE}>
                <p style={{ fontWeight: 600, marginBottom: 6, fontSize: 13, color: '#e2e8f0' }}>{label}</p>
                {payload.map((entry: any, i: number) => {
                    const val = entry.value as number;
                    const key = entry.dataKey as string;
                    const mMax = isMax(val, key, minMaxMap);
                    const mMin = isMin(val, key, minMaxMap);
                    return (
                        <p key={i} style={{
                            margin: '3px 0',
                            fontSize: 11,
                            color: mMax ? '#4ade80' : mMin ? '#f87171' : '#cbd5e1',
                            fontWeight: mMax || mMin ? 700 : 400,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            opacity: hoveredDataset && seriesDatasetMap[key] !== hoveredDataset ? 0.3 : 1,
                        }}>
                            <span style={{
                                display: 'inline-block', width: 8, height: 8,
                                borderRadius: '50%', backgroundColor: entry.color,
                            }} />
                            <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {entry.name}
                            </span>
                            : {formatValueSmart(val, key, config.metrics)}
                            {mMax && ' ▲'}
                            {mMin && ' ▼'}
                        </p>
                    );
                })}
            </div>
        );
    };

    // ── Interactive Legend ──
    const InteractiveLegend = () => {
        // Order: primary first, then alphabetically
        const orderedDatasets = [...datasets].sort((a, b) => {
            if (a.isPrimary) return -1;
            if (b.isPrimary) return 1;
            return a.label.localeCompare(b.label);
        });

        return (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-2 pb-1">
                {orderedDatasets.map(ds => {
                    const isHidden = hiddenDatasets.has(ds.label);
                    const isHovered = hoveredDataset === ds.label;
                    return (
                        <button
                            key={ds.label}
                            onClick={() => toggleDataset(ds.label)}
                            onMouseEnter={() => setHoveredDataset(ds.label)}
                            onMouseLeave={() => setHoveredDataset(null)}
                            className="flex items-center gap-1.5 text-[11px] transition-all duration-200 rounded-md px-1.5 py-0.5"
                            style={{
                                opacity: isHidden ? 0.35 : (hoveredDataset && !isHovered ? 0.5 : 1),
                                fontWeight: isHovered || ds.isPrimary ? 600 : 400,
                                backgroundColor: isHovered ? `${ds.color}10` : 'transparent',
                            }}
                        >
                            <span
                                className="rounded-full transition-all duration-200"
                                style={{
                                    width: isHovered ? 10 : 8,
                                    height: isHovered ? 10 : 8,
                                    backgroundColor: isHidden ? '#94a3b8' : ds.color,
                                    border: isHidden ? '2px solid #94a3b8' : 'none',
                                }}
                            />
                            <span style={{
                                color: isHidden ? '#94a3b8' : '#64748b',
                                textDecoration: isHidden ? 'line-through' : 'none',
                            }}>
                                {ds.label}
                                {ds.isPrimary && ' ★'}
                            </span>
                        </button>
                    );
                })}
            </div>
        );
    };

    // ── Determine chart margin with more top space for labels ──
    const chartMargin = { top: 20, right: 20, bottom: typo.marginBottom, left: 10 };

    // ── Bar Chart (Merged) ──
    const renderBarChart = () => (
        <ResponsiveContainer width="100%" height={height - 40}>
            <BarChart data={mergedData} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.15)" />
                <XAxis
                    dataKey="name" fontSize={typo.axisTick}
                    stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: typo.axisTick }}
                    tickLine={{ stroke: '#64748b' }}
                    interval={0} angle={typo.xAxisAngle}
                    textAnchor={typo.xAxisAnchor} height={typo.xAxisHeight}
                />
                <YAxis
                    fontSize={typo.axisTick} stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: typo.axisTick }}
                    tickLine={false} axisLine={false} width={50}
                />
                <Tooltip content={<MergedTooltip />} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
                {seriesKeys.map((key, i) => {
                    const dsLabel = seriesDatasetMap[key];
                    const opacity = getSeriesOpacity(key);
                    return (
                        <Bar
                            key={key}
                            dataKey={key}
                            fill={seriesColors[i]}
                            radius={[3, 3, 0, 0]}
                            opacity={opacity}
                            onMouseEnter={() => setHoveredDataset(dsLabel)}
                            onMouseLeave={() => setHoveredDataset(null)}
                            style={{ transition: 'opacity 0.3s ease' }}
                        >
                            {/* Min/max labels on bars */}
                            <LabelList
                                dataKey={key}
                                position="top"
                                content={(props: any) => {
                                    const { x, y, width, value } = props;
                                    if (!value || value === 0) return null;
                                    const mMax = isMax(value, key, minMaxMap);
                                    const mMin = isMin(value, key, minMaxMap);
                                    if (!mMax && !mMin) return null;
                                    return (
                                        <text
                                            x={x + width / 2} y={y - 5}
                                            textAnchor="middle" fontSize={8}
                                            fontWeight={700}
                                            fill={mMax ? '#22c55e' : '#ef4444'}
                                        >
                                            {mMax ? '▲' : '▼'}
                                        </text>
                                    );
                                }}
                            />
                        </Bar>
                    );
                })}
            </BarChart>
        </ResponsiveContainer>
    );

    // ── Line Chart (Merged) ──
    const renderLineChart = () => (
        <ResponsiveContainer width="100%" height={height - 40}>
            <LineChart data={mergedData} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.15)" />
                <XAxis
                    dataKey="name" fontSize={typo.axisTick}
                    stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: typo.axisTick }}
                    tickLine={{ stroke: '#64748b' }}
                    angle={typo.xAxisAngle} textAnchor={typo.xAxisAnchor}
                    height={typo.xAxisHeight}
                />
                <YAxis
                    fontSize={typo.axisTick} stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: typo.axisTick }}
                    tickLine={false} axisLine={false} width={50}
                />
                <Tooltip content={<MergedTooltip />} />
                {seriesKeys.map((key, i) => {
                    const dsLabel = seriesDatasetMap[key];
                    const opacity = getSeriesOpacity(key);
                    const isHovered = hoveredDataset === dsLabel;
                    return (
                        <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            stroke={seriesColors[i]}
                            strokeWidth={isHovered ? 3.5 : 2}
                            strokeOpacity={opacity}
                            dot={(dotProps: any) => {
                                const { cx, cy, payload } = dotProps;
                                if (cx == null || cy == null || !payload) return <g />;
                                const val = typeof payload[key] === 'number' ? payload[key] : 0;
                                const mMax = isMax(val, key, minMaxMap);
                                const mMin = isMin(val, key, minMaxMap);
                                const baseR = isHovered ? 4 : 2.5;
                                if (mMax || mMin) {
                                    const color = mMax ? '#22c55e' : '#ef4444';
                                    return (
                                        <g key={`${cx}-${cy}`}>
                                            <circle cx={cx} cy={cy} r={6} fill={color} opacity={0.15 * opacity} />
                                            <circle cx={cx} cy={cy} r={4} fill="#fff" stroke={color} strokeWidth={2} opacity={opacity} />
                                            <text x={cx} y={cy - 10} textAnchor="middle" fontSize={8} fontWeight={700} fill={color} opacity={opacity}>
                                                {mMax ? '▲' : '▼'}
                                            </text>
                                        </g>
                                    );
                                }
                                return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={baseR} fill={seriesColors[i]} opacity={opacity} />;
                            }}
                            activeDot={{ r: 6, stroke: seriesColors[i], strokeWidth: 2, fill: '#fff' }}
                            onMouseEnter={() => setHoveredDataset(dsLabel)}
                            onMouseLeave={() => setHoveredDataset(null)}
                            style={{ transition: 'stroke-opacity 0.3s ease, stroke-width 0.3s ease' }}
                        />
                    );
                })}
            </LineChart>
        </ResponsiveContainer>
    );

    // ── Pie Chart (Merged — concentric rings) ──
    const renderPieChart = () => {
        const maxRadius = Math.min((height - 60) * 0.35, 130);
        const visibleDatasets = perDatasetData.filter(ds => !hiddenDatasets.has(ds.label));
        const ringWidth = Math.max(15, maxRadius / (visibleDatasets.length + 1));

        return (
            <ResponsiveContainer width="100%" height={height - 40}>
                <PieChart>
                    {visibleDatasets.map((ds, dsIdx) => {
                        const outerR = maxRadius - dsIdx * (ringWidth + 3);
                        const innerR = outerR - ringWidth;
                        if (outerR < 15) return null;

                        const pieData = ds.rows.map(row => {
                            const m = config.metrics[0];
                            const rawKey = `${m.metricId}:${m.aggregation}`;
                            return { name: row.dimensionLabel, value: Math.round((row.values[rawKey] ?? 0) * 100) / 100 };
                        });

                        const opacity = hoveredDataset ? (hoveredDataset === ds.label ? 1 : 0.2) : 1;

                        return (
                            <Pie
                                key={ds.label}
                                data={pieData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%" cy="50%"
                                outerRadius={outerR}
                                innerRadius={innerR}
                                paddingAngle={2}
                                label={dsIdx === 0 ? ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%` : false}
                                labelLine={dsIdx === 0 ? { stroke: '#94a3b8', strokeWidth: 1 } : false}
                                fontSize={10}
                                opacity={opacity}
                                onMouseEnter={() => setHoveredDataset(ds.label)}
                                onMouseLeave={() => setHoveredDataset(null)}
                                style={{ transition: 'opacity 0.3s ease' }}
                            >
                                {pieData.map((_, i) => (
                                    <Cell key={i} fill={ds.color} stroke="none" opacity={0.5 + 0.5 * ((pieData.length - i) / pieData.length)} />
                                ))}
                            </Pie>
                        );
                    })}
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
            </ResponsiveContainer>
        );
    };

    // ── Render ──
    return (
        <div className="w-full">
            {config.visualization !== 'table' && <InteractiveLegend />}
            {(() => {
                switch (config.visualization) {
                    case 'bar':
                    case 'stacked-bar':
                        return renderBarChart();
                    case 'line':
                        return renderLineChart();
                    case 'pie':
                        return renderPieChart();
                    case 'table':
                        return (
                            <>
                                <InteractiveLegend />
                                <MergedTableRenderer
                                    dimLabel={DIMENSION_REGISTRY[config.dimension]?.label ?? config.dimension}
                                    mergedData={mergedData}
                                    seriesKeys={seriesKeys}
                                    seriesColors={seriesColors}
                                    seriesDatasetMap={seriesDatasetMap}
                                    minMaxMap={minMaxMap}
                                    hoveredDataset={hoveredDataset}
                                    setHoveredDataset={setHoveredDataset}
                                    metrics={config.metrics}
                                />
                            </>
                        );
                    default:
                        return <div className="text-slate-400 text-sm text-center p-4">Unsupported visualization: {config.visualization}</div>;
                }
            })()}
        </div>
    );
};

// ── Table sub-component (extracted to avoid conditional hook calls) ──

interface MergedTableRendererProps {
    dimLabel: string;
    mergedData: Record<string, string | number>[];
    seriesKeys: string[];
    seriesColors: string[];
    seriesDatasetMap: Record<string, string>;
    minMaxMap: Record<string, MinMaxEntry>;
    hoveredDataset: string | null;
    setHoveredDataset: (ds: string | null) => void;
    metrics: MetricSelection[];
}

const MergedTableRenderer: React.FC<MergedTableRendererProps> = ({
    dimLabel, mergedData, seriesKeys, seriesColors, seriesDatasetMap,
    minMaxMap, hoveredDataset, setHoveredDataset, metrics,
}) => {
    const [sortCol, setSortCol] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const sorted = useMemo(() => {
        if (!sortCol) return mergedData;
        return [...mergedData].sort((a, b) => {
            const aVal = sortCol === '__name__' ? (a.name as string) : (a[sortCol] as number ?? 0);
            const bVal = sortCol === '__name__' ? (b.name as string) : (b[sortCol] as number ?? 0);
            const cmp = typeof aVal === 'number' ? aVal - (bVal as number) : (aVal as string).localeCompare(bVal as string);
            return sortDir === 'desc' ? -cmp : cmp;
        });
    }, [mergedData, sortCol, sortDir]);

    const handleSort = (col: string) => {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('desc'); }
    };

    const SortIcon: React.FC<{ col: string }> = ({ col }) => {
        if (sortCol !== col) return <ChevronDown size={10} className="opacity-30 ml-0.5 inline" />;
        return sortDir === 'asc'
            ? <ChevronUp size={10} className="text-blue-500 ml-0.5 inline" />
            : <ChevronDown size={10} className="text-blue-500 ml-0.5 inline" />;
    };

    return (
        <div className="overflow-x-auto max-h-80 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-medium sticky top-0 z-10">
                    <tr>
                        <th className="px-3 py-2 text-[10px] uppercase tracking-wider cursor-pointer hover:text-slate-700 transition-colors"
                            onClick={() => handleSort('__name__')}>
                            {dimLabel} <SortIcon col="__name__" />
                        </th>
                        {seriesKeys.map((k, i) => {
                            const dsLabel = seriesDatasetMap[k];
                            return (
                                <th key={k}
                                    className="px-3 py-2 text-right text-[10px] uppercase tracking-wider cursor-pointer hover:text-slate-700 transition-colors"
                                    onClick={() => handleSort(k)}
                                    onMouseEnter={() => setHoveredDataset(dsLabel)}
                                    onMouseLeave={() => setHoveredDataset(null)}
                                    style={{
                                        borderBottom: `2px solid ${seriesColors[i]}`,
                                        opacity: hoveredDataset && hoveredDataset !== dsLabel ? 0.4 : 1,
                                    }}>
                                    {k} <SortIcon col={k} />
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sorted.map((row, ri) => (
                        <tr key={ri} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{row.name}</td>
                            {seriesKeys.map((k) => {
                                const val = typeof row[k] === 'number' ? (row[k] as number) : 0;
                                const mMax = isMax(val, k, minMaxMap);
                                const mMin = isMin(val, k, minMaxMap);
                                const dsLabel = seriesDatasetMap[k];
                                return (
                                    <td key={k}
                                        className="px-3 py-2 text-right tabular-nums transition-opacity duration-200"
                                        onMouseEnter={() => setHoveredDataset(dsLabel)}
                                        onMouseLeave={() => setHoveredDataset(null)}
                                        style={{
                                            opacity: hoveredDataset && hoveredDataset !== dsLabel ? 0.3 : 1,
                                            fontWeight: mMax || mMin ? 700 : 400,
                                            color: mMax ? '#22c55e' : mMin ? '#ef4444' : undefined,
                                        }}>
                                        <span className="inline-flex items-center gap-0.5">
                                            {formatValueSmart(val, k, metrics)}
                                            {mMax && <TrendingUp size={10} className="text-emerald-500" />}
                                            {mMin && <TrendingDown size={10} className="text-red-500" />}
                                        </span>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
                <tfoot className="bg-slate-100 dark:bg-slate-950 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                        <td className="px-3 py-2 text-slate-800 dark:text-white text-[10px] uppercase tracking-wider">Total</td>
                        {seriesKeys.map((k) => {
                            const total = sorted.reduce((sum, row) => sum + (typeof row[k] === 'number' ? (row[k] as number) : 0), 0);
                            return (
                                <td key={k} className="px-3 py-2 text-right text-slate-800 dark:text-white tabular-nums"
                                    style={{ opacity: hoveredDataset && hoveredDataset !== seriesDatasetMap[k] ? 0.3 : 1 }}>
                                    {formatValueSmart(total, k, metrics)}
                                </td>
                            );
                        })}
                    </tr>
                </tfoot>
            </table>
        </div>
    );
};
