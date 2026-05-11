/**
 * syncUserProfile — Firestore trigger on staffMembers/{staffId}
 *
 * Maintains the userProfiles/{uid} lookup collection used by Firestore
 * security rules for O(1) role resolution (uid → role).
 *
 * When a StaffMember document is created or updated with a uid field,
 * this trigger writes/updates the corresponding userProfiles/{uid} document.
 *
 * When a StaffMember is deleted, the corresponding userProfile is removed.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

interface StaffMemberData {
  uid?: string;
  orgId?: string;
  role?: string;
}

interface UserProfileData {
  uid: string;
  orgId: string;
  staffMemberId: string;
  role: string;
}

export const onStaffMemberWrite = functions.firestore
  .document("staffMembers/{staffId}")
  .onWrite(async (change, context) => {
    const staffId = context.params.staffId;
    const before = change.before.data() as StaffMemberData | undefined;
    const after = change.after.data() as StaffMemberData | undefined;

    // Delete case: staffMember was deleted
    if (!after) {
      if (before?.uid) {
        await db.doc(`userProfiles/${before.uid}`).delete();
        functions.logger.info(
          `Deleted userProfile for uid=${before.uid} (staffMember ${staffId} deleted)`
        );
      }
      return;
    }

    const uid = after.uid;
    if (!uid) {
      // No uid set — nothing to sync
      return;
    }

    // If uid changed, clean up old userProfile
    if (before?.uid && before.uid !== uid) {
      await db.doc(`userProfiles/${before.uid}`).delete();
      functions.logger.info(
        `Deleted old userProfile for uid=${before.uid} (uid changed to ${uid})`
      );
    }

    // Write/update userProfile
    const profileData: UserProfileData = {
      uid,
      orgId: after.orgId || "",
      staffMemberId: staffId,
      role: after.role || "STAFF",
    };

    await db.doc(`userProfiles/${uid}`).set(profileData, { merge: false });
    functions.logger.info(
      `Synced userProfile for uid=${uid}, role=${profileData.role}, org=${profileData.orgId}`
    );
  });
