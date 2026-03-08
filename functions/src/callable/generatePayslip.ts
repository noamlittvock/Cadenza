/**
 * generatePayslip — Cloud Function callable
 *
 * Section 17: Payslip aggregation
 * Aggregates EventParticipant records for a staff member within a billing period.
 * Applies financial formulas from Section 17 per rateType.
 * Returns itemized output (not stored — derived on demand).
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

interface GeneratePayslipInput {
  orgId: string;
  staffMemberId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
}

interface PayslipLineItem {
  eventId: string;
  eventDate: string;
  eventName: string;
  activityId: string;
  activityName: string;
  rateType: "HOURLY" | "PER_EVENT" | "MONTHLY_FLAT";
  rateValue: number;
  effectiveRate: number;
  hasOverride: boolean;
  durationMinutes: number;
  cost: number;
}

interface PayslipResult {
  staffMemberId: string;
  staffName: string;
  periodStart: string;
  periodEnd: string;
  items: PayslipLineItem[];
  grandTotal: number;
}

export const generatePayslip = functions.https.onCall(
  async (data: GeneratePayslipInput, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required."
      );
    }

    const { orgId, staffMemberId, periodStart, periodEnd } = data;
    if (!orgId || !staffMemberId || !periodStart || !periodEnd) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "orgId, staffMemberId, periodStart, and periodEnd are required."
      );
    }

    const db = admin.firestore();

    // Fetch staff member name
    const staffDoc = await db
      .collection(`orgs/${orgId}/staffMembers`)
      .doc(staffMemberId)
      .get();
    if (!staffDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Staff member not found.");
    }
    const staffData = staffDoc.data()!;
    const staffName = `${staffData.firstName || ""} ${staffData.lastName || ""}`.trim();

    // Fetch all EventParticipant records for this staff member (STAFF only)
    const participantsSnap = await db
      .collection(`orgs/${orgId}/eventParticipants`)
      .where("staffMemberId", "==", staffMemberId)
      .where("participantType", "==", "STAFF")
      .get();

    if (participantsSnap.empty) {
      return {
        staffMemberId,
        staffName,
        periodStart,
        periodEnd,
        items: [],
        grandTotal: 0,
      } as PayslipResult;
    }

    // Collect unique event IDs
    const eventIds = new Set<string>();
    const participants = participantsSnap.docs.map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      eventIds.add(d.eventId as string);
      return { id: doc.id, ...d } as Record<string, unknown>;
    });

    // Fetch all referenced events
    const eventMap = new Map<string, Record<string, unknown>>();
    const eventIdArr = Array.from(eventIds);
    // Firestore 'in' queries limited to 30 items — batch if needed
    for (let i = 0; i < eventIdArr.length; i += 30) {
      const batch = eventIdArr.slice(i, i + 30);
      const eventsSnap = await db
        .collection(`orgs/${orgId}/events`)
        .where(admin.firestore.FieldPath.documentId(), "in", batch)
        .get();
      eventsSnap.docs.forEach((doc) => {
        eventMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
    }

    // Fetch activities for display names
    const activityIds = new Set<string>();
    eventMap.forEach((evt) => {
      if (evt.activityId) activityIds.add(evt.activityId as string);
    });
    const activityMap = new Map<string, string>();
    const actIdArr = Array.from(activityIds);
    for (let i = 0; i < actIdArr.length; i += 30) {
      const batch = actIdArr.slice(i, i + 30);
      const actSnap = await db
        .collection(`orgs/${orgId}/activities`)
        .where(admin.firestore.FieldPath.documentId(), "in", batch)
        .get();
      actSnap.docs.forEach((doc) => {
        const d = doc.data();
        activityMap.set(doc.id, (d.name as string) || "Unnamed Activity");
      });
    }

    // Build payslip line items
    const items: PayslipLineItem[] = [];
    let grandTotal = 0;

    for (const p of participants) {
      const event = eventMap.get(p.eventId as string);
      if (!event) continue;

      // Only COMPLETED events
      if (event.status !== "COMPLETED") continue;

      // Date within billing period
      const eventDate = event.date as string;
      if (eventDate < periodStart || eventDate > periodEnd) continue;

      // Rate resolution: effectiveRate = rateOverride ?? rateSnapshot.rateValue
      const snapshot = p.rateSnapshot as
        | { rateType: string; rateValue: number }
        | undefined;
      if (!snapshot) continue;

      const rateOverride = p.rateOverride as number | null | undefined;
      const effectiveRate =
        rateOverride != null ? rateOverride : snapshot.rateValue;
      const hasOverride = rateOverride != null;

      const durationMinutes = (event.durationMinutes as number) || 0;
      const rateType = snapshot.rateType as "HOURLY" | "PER_EVENT" | "MONTHLY_FLAT";

      // Section 17 formulas
      let cost = 0;
      if (rateType === "HOURLY") {
        cost = effectiveRate * (durationMinutes / 60);
      } else if (rateType === "PER_EVENT") {
        cost = effectiveRate;
      } else if (rateType === "MONTHLY_FLAT") {
        cost = effectiveRate;
      }

      grandTotal += cost;

      items.push({
        eventId: event.id as string,
        eventDate,
        eventName: (event.name as string) || "",
        activityId: (event.activityId as string) || "",
        activityName:
          activityMap.get(event.activityId as string) || "Unnamed Activity",
        rateType,
        rateValue: snapshot.rateValue,
        effectiveRate,
        hasOverride,
        durationMinutes,
        cost,
      });
    }

    // Sort by date then event name
    items.sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.eventName.localeCompare(b.eventName));

    return {
      staffMemberId,
      staffName,
      periodStart,
      periodEnd,
      items,
      grandTotal,
    } as PayslipResult;
  }
);
