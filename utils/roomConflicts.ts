import { CalendarEvent } from '../types';

export interface RoomConflict {
  eventA: CalendarEvent;
  eventB: CalendarEvent;
  roomId: string;
  overlapStart: Date;
  overlapEnd: Date;
}

/**
 * Detect pairwise time overlaps for events sharing the same roomId.
 * Only considers non-canceled, non-hidden events with a roomId.
 */
export function detectRoomConflicts(events: CalendarEvent[]): RoomConflict[] {
  const eligible = events.filter(e => !e.isCanceled && !e.isHidden && e.roomId);

  // Group by roomId
  const byRoom = new Map<string, CalendarEvent[]>();
  for (const ev of eligible) {
    const list = byRoom.get(ev.roomId!) || [];
    list.push(ev);
    byRoom.set(ev.roomId!, list);
  }

  const conflicts: RoomConflict[] = [];

  for (const [roomId, roomEvents] of byRoom) {
    if (roomEvents.length < 2) continue;

    // Sort by start time for efficient pairwise check
    roomEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    for (let i = 0; i < roomEvents.length; i++) {
      const a = roomEvents[i];
      const aStart = new Date(a.start).getTime();
      const aEnd = new Date(a.end).getTime();

      for (let j = i + 1; j < roomEvents.length; j++) {
        const b = roomEvents[j];
        const bStart = new Date(b.start).getTime();
        const bEnd = new Date(b.end).getTime();

        // Since sorted by start, if b starts after a ends, no more overlaps for a
        if (bStart >= aEnd) break;

        // Overlap exists
        conflicts.push({
          eventA: a,
          eventB: b,
          roomId,
          overlapStart: new Date(Math.max(aStart, bStart)),
          overlapEnd: new Date(Math.min(aEnd, bEnd)),
        });
      }
    }
  }

  return conflicts;
}

/**
 * Returns a Set of event IDs that are involved in room conflicts.
 */
export function getConflictingEventIds(conflicts: RoomConflict[]): Set<string> {
  const ids = new Set<string>();
  for (const c of conflicts) {
    ids.add(c.eventA.id);
    ids.add(c.eventB.id);
  }
  return ids;
}
