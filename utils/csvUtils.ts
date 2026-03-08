/**
 * csvUtils.ts — Phase 12 CSV Import / Export utilities
 * Templates, parsing, duplicate detection, export generation, file download.
 */

import type { ImportEntityType } from '../types/v2';

// ─── Template column definitions (spec §12) ─────────────────────────────────

export const TEMPLATE_COLUMNS: Record<ImportEntityType, string[]> = {
  STUDENT: ['fullName', 'dateOfBirth', 'parentName', 'parentPhone'],
  STAFF_MEMBER: ['fullName', 'email', 'phone', 'role'],
  ENROLLMENT: ['studentFullName', 'activityName', 'l2Name', 'startDate'],
  EVENT: ['activityName', 'l2Name', 'date', 'startTime', 'endTime', 'location'],
  TEACHING_ASSIGNMENT: ['staffEmail', 'activityName', 'l2Name', 'rateType', 'rateValue', 'startDate'],
};

const TEMPLATE_EXAMPLES: Record<ImportEntityType, string[][]> = {
  STUDENT: [['Jane Smith', '2010-05-15', 'John Smith', '555-0101']],
  STAFF_MEMBER: [['John Doe', 'john@music.com', '555-0199', 'STAFF']],
  ENROLLMENT: [['Jane Smith', 'Piano', 'Beginner', '2024-09-01']],
  EVENT: [['Piano', 'Beginner', '2024-09-15', '09:00', '10:00', 'Room A']],
  TEACHING_ASSIGNMENT: [['john@music.com', 'Piano', 'Beginner', 'HOURLY', '150', '2024-09-01']],
};

export function generateTemplate(entityType: ImportEntityType): string {
  const cols = TEMPLATE_COLUMNS[entityType];
  const rows = [cols.join(','), ...TEMPLATE_EXAMPLES[entityType].map(r => r.join(','))];
  return rows.join('\n');
}

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result.map(v => v.replace(/^"|"$/g, '').trim());
}

export function parseCSVText(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0]);
  return lines.slice(1)
    .map(line => {
      const values = parseLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
      return row;
    })
    .filter(row => Object.values(row).some(v => v));
}

// ─── Column Mapping ──────────────────────────────────────────────────────────

const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, '');

/** Returns mapping: expectedColumn → uploadedHeader (best-match). */
export function mapColumns(
  uploadedHeaders: string[],
  entityType: ImportEntityType,
): Record<string, string> {
  const expected = TEMPLATE_COLUMNS[entityType];
  const mapping: Record<string, string> = {};
  expected.forEach(exp => {
    const match = uploadedHeaders.find(h => normalize(h) === normalize(exp));
    if (match) mapping[exp] = match;
  });
  return mapping;
}

/** Returns list of expected columns that couldn't be auto-mapped. */
export function unmappedColumns(mapping: Record<string, string>, entityType: ImportEntityType): string[] {
  return TEMPLATE_COLUMNS[entityType].filter(col => !mapping[col]);
}

// ─── Duplicate detection ─────────────────────────────────────────────────────

export function rowDuplicateKey(row: Record<string, string>, entityType: ImportEntityType): string {
  switch (entityType) {
    case 'STUDENT':
      return (row['fullName'] ?? '').toLowerCase().trim();
    case 'STAFF_MEMBER':
      return (row['email'] ?? '').toLowerCase().trim();
    case 'ENROLLMENT':
      return [row['studentFullName'], row['activityName'], row['l2Name']].join('|').toLowerCase();
    case 'EVENT':
      return [row['activityName'], row['l2Name'], row['date'], row['startTime']].join('|').toLowerCase();
    case 'TEACHING_ASSIGNMENT':
      return [row['staffEmail'], row['activityName'], row['l2Name']].join('|').toLowerCase();
  }
}

// ─── Export generation ───────────────────────────────────────────────────────

export function generateExportCSV(
  entityType: ImportEntityType,
  data: Record<string, string>[],
): string {
  if (data.length === 0) return TEMPLATE_COLUMNS[entityType].join(',');
  const cols = TEMPLATE_COLUMNS[entityType];
  const rows = data.map(row =>
    cols.map(col => {
      const val = row[col] ?? '';
      return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(',')
  );
  return [cols.join(','), ...rows].join('\n');
}

// ─── File download ───────────────────────────────────────────────────────────

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
