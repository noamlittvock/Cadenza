"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.icalFeed = exports.generatePayslip = exports.computeDuration = exports.resolveRate = exports.onStaffMemberWrite = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
// ─── v2.0 Cloud Functions ────────────────────────────────────────────────────
// Trigger: sync userProfiles/{uid} when staffMembers are written
var syncUserProfile_1 = require("./triggers/syncUserProfile");
Object.defineProperty(exports, "onStaffMemberWrite", { enumerable: true, get: function () { return syncUserProfile_1.onStaffMemberWrite; } });
// Callable stubs (implementation in later phases)
var resolveRate_1 = require("./callable/resolveRate");
Object.defineProperty(exports, "resolveRate", { enumerable: true, get: function () { return resolveRate_1.resolveRate; } });
var computeDuration_1 = require("./callable/computeDuration");
Object.defineProperty(exports, "computeDuration", { enumerable: true, get: function () { return computeDuration_1.computeDuration; } });
var generatePayslip_1 = require("./callable/generatePayslip");
Object.defineProperty(exports, "generatePayslip", { enumerable: true, get: function () { return generatePayslip_1.generatePayslip; } });
// --- iCal Helpers ---
/** Escape special characters per RFC 5545 */
function escapeIcal(str) {
    return str
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\n/g, "\\n");
}
/** Convert ISO datetime to iCal DATETIME format (UTC) */
function toIcalDatetime(iso) {
    const d = new Date(iso);
    const pad = (n) => n.toString().padStart(2, "0");
    return (d.getUTCFullYear().toString() +
        pad(d.getUTCMonth() + 1) +
        pad(d.getUTCDate()) +
        "T" +
        pad(d.getUTCHours()) +
        pad(d.getUTCMinutes()) +
        pad(d.getUTCSeconds()) +
        "Z");
}
/** Fold long lines per RFC 5545 (max 75 octets per line) */
function foldLine(line) {
    const maxLen = 75;
    if (line.length <= maxLen)
        return line;
    const parts = [];
    parts.push(line.substring(0, maxLen));
    let pos = maxLen;
    while (pos < line.length) {
        parts.push(" " + line.substring(pos, pos + maxLen - 1));
        pos += maxLen - 1;
    }
    return parts.join("\r\n");
}
/** Build a VEVENT block */
function buildVevent(event, roomName) {
    const lines = [
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
function matchesFilters(event, filters, teachers) {
    var _a, _b, _c, _d, _e;
    // Skip canceled/hidden events
    if (event.isCanceled || event.isHidden)
        return false;
    const staffIds = event.staffMemberIds || (event.teacherId ? [event.teacherId] : []);
    // Staff member filter
    if ((_a = filters.staffMemberIds) === null || _a === void 0 ? void 0 : _a.length) {
        if (!staffIds.some((id) => filters.staffMemberIds.includes(id)))
            return false;
    }
    // Activity filter
    if ((_b = filters.activityIds) === null || _b === void 0 ? void 0 : _b.length) {
        if (!event.activityId || !filters.activityIds.includes(event.activityId))
            return false;
    }
    // Room filter
    if ((_c = filters.roomIds) === null || _c === void 0 ? void 0 : _c.length) {
        if (!event.roomId || !filters.roomIds.includes(event.roomId))
            return false;
    }
    // Tag filter — match if any assigned staff member has a matching tag
    if ((_d = filters.tags) === null || _d === void 0 ? void 0 : _d.length) {
        const hasMatchingTag = staffIds.some((sid) => {
            var _a;
            const teacher = teachers.get(sid);
            return (_a = teacher === null || teacher === void 0 ? void 0 : teacher.tags) === null || _a === void 0 ? void 0 : _a.some((tag) => filters.tags.includes(tag));
        });
        if (!hasMatchingTag)
            return false;
    }
    // Position title filter — match if any assigned staff member has a matching position
    if ((_e = filters.positionTitles) === null || _e === void 0 ? void 0 : _e.length) {
        const hasMatchingPosition = staffIds.some((sid) => {
            var _a;
            const teacher = teachers.get(sid);
            return (_a = teacher === null || teacher === void 0 ? void 0 : teacher.positionAssignments) === null || _a === void 0 ? void 0 : _a.some((pa) => filters.positionTitles.includes(pa.positionName));
        });
        if (!hasMatchingPosition)
            return false;
    }
    return true;
}
// --- Cloud Function: iCal Feed ---
exports.icalFeed = functions.https.onRequest(async (req, res) => {
    var _a;
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
    let subDoc = null;
    let orgId = "";
    if (!subsSnapshot.empty) {
        const doc = subsSnapshot.docs[0];
        subDoc = { id: doc.id, ...doc.data() };
        orgId = subDoc.orgId;
    }
    else {
        // Fallback: query all orgs' calendarSubscriptions
        const allOrgsSnapshot = await db
            .collection("calendarSubscriptions")
            .where("token", "==", token)
            .limit(1)
            .get();
        if (!allOrgsSnapshot.empty) {
            const doc = allOrgsSnapshot.docs[0];
            subDoc = { id: doc.id, ...doc.data() };
            orgId = subDoc.orgId;
        }
    }
    // Revoked or not found → empty calendar
    if (!subDoc || !subDoc.isActive) {
        res.set("Content-Type", "text/calendar; charset=utf-8");
        res.set("Content-Disposition", "inline; filename=feed.ics");
        res.send(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cadenza//Empty//EN", "END:VCALENDAR"].join("\r\n"));
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
    const events = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const teacherMap = new Map();
    teachersSnap.docs.forEach((d) => {
        const t = { id: d.id, ...d.data() };
        teacherMap.set(t.id, t);
    });
    const roomMap = new Map();
    roomsSnap.docs.forEach((d) => {
        const r = { id: d.id, ...d.data() };
        roomMap.set(r.id, r);
    });
    // Filter events
    const matchingEvents = events.filter((e) => matchesFilters(e, subDoc.filters, teacherMap));
    // Build iCal output
    const calLines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Cadenza//Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        foldLine(`X-WR-CALNAME:${escapeIcal(subDoc.name)}`),
    ];
    for (const event of matchingEvents) {
        const roomName = event.roomId ? (_a = roomMap.get(event.roomId)) === null || _a === void 0 ? void 0 : _a.name : undefined;
        calLines.push(buildVevent(event, roomName));
    }
    calLines.push("END:VCALENDAR");
    const icalContent = calLines.join("\r\n");
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Content-Disposition", `inline; filename="${subDoc.name}.ics"`);
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(icalContent);
});
//# sourceMappingURL=index.js.map