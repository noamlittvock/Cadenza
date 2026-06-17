import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadCSV, generateExportCSV } from './csvUtils';

describe('csvUtils', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('generates a headers-only CSV for empty exports', () => {
    expect(generateExportCSV('EVENT', [])).toBe('activityName,l2Name,date,startTime,endTime,location');
  });

  it('appends the download anchor before clicking and revokes the blob asynchronously', () => {
    vi.useFakeTimers();

    const anchor = {
      href: '',
      download: '',
      style: {} as CSSStyleDeclaration,
      click: vi.fn(),
      remove: vi.fn(),
    };
    const appendChild = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:cadenza-test');
    const revokeObjectURL = vi.fn();

    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild },
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    downloadCSV('a,b\n1,2', 'event_export.csv');

    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.download).toBe('event_export.csv');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cadenza-test');
  });
});
