/**
 * resolveRate — Cloud Function callable
 *
 * Section 08: Billing Resolution Logic
 * Resolves the rate for an EventParticipant at event creation time.
 * Creates an immutable RateSnapshot on the EventParticipant document.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

interface ResolveRateInput {
  orgId: string;
  eventDate: string; // YYYY-MM-DD
  staffMemberId: string;
  activityId: string;
  l2Id: string;
  assignmentType: "TEACHING" | "ORG_ROLE";
  orgRoleId?: string; // required if assignmentType is ORG_ROLE and multiple roles exist
}

interface RateSnapshotResult {
  rateType: string;
  rateValue: number;
  snapshotDate: FirebaseFirestore.Timestamp;
  teachingAssignmentId?: string;
  orgRoleId?: string;
}

export const resolveRate = functions.https.onCall(
  async (data: ResolveRateInput, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated."
      );
    }

    const { orgId, eventDate, staffMemberId, assignmentType } = data;
    if (!orgId || !eventDate || !staffMemberId || !assignmentType) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: orgId, eventDate, staffMemberId, assignmentType."
      );
    }

    const db = admin.firestore();

    if (assignmentType === "TEACHING") {
      const { activityId, l2Id } = data;
      if (!activityId || !l2Id) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "TEACHING assignment requires activityId and l2Id."
        );
      }

      // Query teaching assignments matching criteria
      const snap = await db
        .collection("teachingAssignments")
        .where("orgId", "==", orgId)
        .where("staffMemberId", "==", staffMemberId)
        .where("activityId", "==", activityId)
        .where("l2Id", "==", l2Id)
        .where("isArchived", "==", false)
        .get();

      // Filter by date range in memory (Firestore can't do compound range on multiple fields)
      const matching = snap.docs.filter((doc) => {
        const d = doc.data();
        if (d.startDate > eventDate) return false;
        if (d.endDate && d.endDate < eventDate) return false;
        return true;
      });

      if (matching.length === 0) {
        throw new functions.https.HttpsError(
          "not-found",
          "No active teaching assignment found for this staff member at this activity and level."
        );
      }

      if (matching.length > 1) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Configuration error: multiple overlapping assignments exist. Contact Super Admin."
        );
      }

      const assignment = matching[0].data();
      const result: RateSnapshotResult = {
        rateType: assignment.rateType,
        rateValue: assignment.rateValue,
        snapshotDate: admin.firestore.Timestamp.now(),
        teachingAssignmentId: matching[0].id,
      };
      return result;
    } else if (assignmentType === "ORG_ROLE") {
      // Query org roles for this staff member
      const snap = await db
        .collection("orgRoles")
        .where("orgId", "==", orgId)
        .where("staffMemberId", "==", staffMemberId)
        .where("isArchived", "==", false)
        .get();

      const matching = snap.docs.filter((doc) => {
        const d = doc.data();
        if (d.startDate > eventDate) return false;
        if (d.endDate && d.endDate < eventDate) return false;
        return true;
      });

      if (matching.length === 0) {
        throw new functions.https.HttpsError(
          "not-found",
          "No active org role found for this staff member on this date."
        );
      }

      // If multiple roles and no specific orgRoleId provided, return the list for client-side picker
      if (matching.length > 1 && !data.orgRoleId) {
        return {
          multipleRoles: true,
          roles: matching.map((doc) => ({
            id: doc.id,
            roleTitle: doc.data().roleTitle,
            rateType: doc.data().rateType,
            rateValue: doc.data().rateValue,
          })),
        };
      }

      // Resolve to specific role
      const targetDoc = data.orgRoleId
        ? matching.find((d) => d.id === data.orgRoleId)
        : matching[0];

      if (!targetDoc) {
        throw new functions.https.HttpsError(
          "not-found",
          "Specified org role not found or not active on this date."
        );
      }

      const role = targetDoc.data();
      const result: RateSnapshotResult = {
        rateType: role.rateType,
        rateValue: role.rateValue,
        snapshotDate: admin.firestore.Timestamp.now(),
        orgRoleId: targetDoc.id,
      };
      return result;
    }

    throw new functions.https.HttpsError(
      "invalid-argument",
      "assignmentType must be TEACHING or ORG_ROLE."
    );
  }
);
