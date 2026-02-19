/**
 * Format a decimal-hours value into H:MM notation.
 *
 * Rules:
 *  - Hours are not zero-padded and may grow indefinitely (no day conversion).
 *  - Minutes are always two digits (zero-padded).
 *  - Negative values include a leading minus sign.
 *  - null / undefined / NaN → "0:00"
 *  - Decimal-hour representations must never be shown.
 *
 * Examples:
 *   3.0833  → "3:05"
 *   33.0833 → "33:05"
 *   333.917 → "333:55"
 *  -1.5     → "-1:30"
 *   0       → "0:00"
 */
export function formatHours(decimalHours: number | null | undefined): string {
    if (decimalHours == null || isNaN(decimalHours)) return '0:00';
    const negative = decimalHours < 0;
    const abs = Math.abs(decimalHours);
    const h = Math.floor(abs);
    const m = Math.round((abs - h) * 60);
    // Edge case: rounding pushes minutes to 60
    if (m === 60) return `${negative ? '-' : ''}${h + 1}:00`;
    return `${negative ? '-' : ''}${h}:${m.toString().padStart(2, '0')}`;
}

/**
 * Format a currency number with thousands separators (no decimals).
 * @param currencySymbol - The currency symbol to prepend (e.g. '₪', '$', '€')
 */
export function formatCurrency(n: number | null | undefined, currencySymbol: string = '₪'): string {
    if (n == null || isNaN(n)) return `${currencySymbol}0`;
    return `${currencySymbol}${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Format a number with a given number of fraction digits.
 */
export function formatNumber(n: number | null | undefined, fractionDigits = 0): string {
    if (n == null || isNaN(n)) return '0';
    return n.toLocaleString('en-US', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}
