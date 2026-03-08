import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// ─── v2.0 Cloud Functions ────────────────────────────────────────────────────

// Trigger: sync userProfiles/{uid} when staffMembers are written
export { onStaffMemberWrite } from "./triggers/syncUserProfile";

// Callable stubs (implementation in later phases)
export { resolveRate } from "./callable/resolveRate";
export { computeDuration } from "./callable/computeDuration";
export { generatePayslip } from "./callable/generatePayslip";

// --- Types (mirror of client-side types relevant to iCal generation) ---

interface SubscriptionFilters {
  staffMemberIds?: string[];
  tags?: string[];
  positionTitles?: string[];
  roomIds?: string[];
  activityIds?: string[];
}

interface CalendarSubscription {
  id: string;
  orgId: string;
  name: string;
  token: string;
  filters: SubscriptionFilters;
  createdBy: string;
  createdAt: string;
  isActive: boolean;
}

interface CalendarEvent {
  id: string;
  name: string;
  description: string;
  start: string;
  end: string;
  teacherId?: string;
  staffMemberIds?: string[];
  roomId?: string;
  activityId?: string;
  tags?: string[];
  positionId?: string;
  isCanceled: boolean;
  isHidden: boolean;
}

interface Teacher {
  id: string;
  fullName: string;
  positionAssignments?: { positionName: string }[];
  tags?: string[];
}

interface Room {
  id: string;
  name: string;
}

// --- iCal Helpers ---

/** Escape special characters per RFC 5545 */
function escapeIcal(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Convert ISO datetime to iCal DATETIME format (UTC) */
function toIcalDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/** Fold long lines per RFC 5545 (max 75 octets per line) */
function foldLine(line: string): string {
  const maxLen = 75;
  if (line.length <= maxLen) return line;
  const parts: string[] = [];
  parts.push(line.substring(0, maxLen));
  let pos = maxLen;
  while (pos < line.length) {
    parts.push(" " + line.substring(pos, pos + maxLen - 1));
    pos += maxLen - 1;
  }
  return parts.join("\r\n");
}

/** Build a VEVENT block */
function buildVevent(
  event: CalendarEvent,
  roomName?: string,
): string {
  const lines: string[] = [
    "BEGIN:VEVENT",
    foldLine(`UID:${event.id}@cadenza`),
    `DTSTART:${toIcalDatetime(event.start)}`,
    `DTEND:${toIcalDatetime(event.end)}`,
    foldLine(`SUMMARY:${escapeIcal(event.name)}`),
  ];
  if (event.description) {
    lines.push(foldLine(`DESCRIPTION:${escapeIcal(event.description)}`));
  }
  if (roomName) {
    lines.push(foldLine(`LOCATION:${escapeIcal(roomName)}`));
  }
  lines.push(`DTSTAMP:${toIcalDatetime(new Date().toISOString())}`);
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

/** Check if an event matches the subscription filters */
function matchesFilters(
  event: CalendarEvent,
  filters: SubscriptionFilters,
  teachers: Map<string, Teacher>,
): boolean {
  // Skip canceled/hidden events
  if (event.isCanceled || event.isHidden) return false;

  const staffIds = event.staffMemberIds || (event.teacherId ? [event.teacherId] : []);

  // Staff member filter
  if (filters.staffMemberIds?.length) {
    if (!staffIds.some((id) => filters.staffMemberIds!.includes(id))) return false;
  }

  // Activity filter
  if (filters.activityIds?.length) {
    if (!event.activityId || !filters.activityIds.includes(event.activityId)) return false;
  }

  // Room filter
  if (filters.roomIds?.length) {
    if (!event.roomId || !filters.roomIds.includes(event.roomId)) return false;
  }

  // Tag filter — match if any assigned staff member has a matching tag
  if (filters.tags?.length) {
    const hasMatchingTag = staffIds.some((sid) => {
      const teacher = teachers.get(sid);
      return teacher?.tags?.some((tag) => filters.tags!.includes(tag));
    });
    if (!hasMatchingTag) return false;
  }

  // Position title filter — match if any assigned staff member has a matching position
  if (filters.positionTitles?.length) {
    const hasMatchingPosition = staffIds.some((sid) => {
      const teacher = teachers.get(sid);
      return teacher?.positionAssignments?.some((pa) =>
        filters.positionTitles!.includes(pa.positionName)
      );
    });
    if (!hasMatchingPosition) return false;
  }

  return true;
}

// --- Cloud Function: iCal Feed ---

export const icalFeed = functions.https.onRequest(async (req, res) => {
  // Extract token from URL path: /api/ical/:token
  const pathParts = req.path.split("/").filter(Boolean);
  const token = pathParts[pathParts.length - 1];

  if (!token) {
    res.status(400).send("Missing token");
    return;
  }

  // Look up subscription by token
  const subsSnapshot = await db
    .collectionGroup("calendarSubscriptions")
    .where("token", "==", token)
    .limit(1)
    .get();

  // Also try org-scoped collection (standard pattern)
  let subDoc: CalendarSubscription | null = null;
  let orgId = "";

  if (!subsSnapshot.empty) {
    const doc = subsSnapshot.docs[0];
    subDoc = { id: doc.id, ...doc.data() } as CalendarSubscription;
    orgId = subDoc.orgId;
  } else {
    // Fallback: query all orgs' calendarSubscriptions
    const allOrgsSnapshot = await db
      .collection("calendarSubscriptions")
      .where("token", "==", token)
      .limit(1)
      .get();
    if (!allOrgsSnapshot.empty) {
      const doc = allOrgsSnapshot.docs[0];
      subDoc = { id: doc.id, ...doc.data() } as CalendarSubscription;
      orgId = subDoc.orgId;
    }
  }

  // Revoked or not found → empty calendar
  if (!subDoc || !subDoc.isActive) {
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Content-Disposition", "inline; filename=feed.ics");
    res.send(
      ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cadenza//Empty//EN", "END:VCALENDAR"].join(
        "\r\n"
      )
    );
    return;
  }

  // Fetch events, teachers, rooms for this org
  const [eventsSnap, teachersSnap, roomsSnap] = await Promise.all([
    orgId
      ? db.collection(`orgs/${orgId}/events`).get()
      : db.collection("events").get(),
    orgId
      ? db.collection(`orgs/${orgId}/teachers`).get()
      : db.collection("teachers").get(),
    orgId
      ? db.collection(`orgs/${orgId}/rooms`).get()
      : db.collection("rooms").get(),
  ]);

  const events: CalendarEvent[] = eventsSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as CalendarEvent
  );
  const teacherMap = new Map<string, Teacher>();
  teachersSnap.docs.forEach((d) => {
    const t = { id: d.id, ...d.data() } as Teacher;
    teacherMap.set(t.id, t);
  });
  const roomMap = new Map<string, Room>();
  roomsSnap.docs.forEach((d) => {
    const r = { id: d.id, ...d.data() } as Room;
    roomMap.set(r.id, r);
  });

  // Filter events
  const matchingEvents = events.filter((e) =>
    matchesFilters(e, subDoc!.filters, teacherMap)
  );

  // Build iCal output
  const calLines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cadenza//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeIcal(subDoc.name)}`),
  ];

  for (const event of matchingEvents) {
    const roomName = event.roomId ? roomMap.get(event.roomId)?.name : undefined;
    calLines.push(buildVevent(event, roomName));
  }

  calLines.push("END:VCALENDAR");

  const icalContent = calLines.join("\r\n");

  res.set("Content-Type", "text/calendar; charset=utf-8");
  res.set("Content-Disposition", `inline; filename="${subDoc.name}.ics"`);
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(icalContent);
});
