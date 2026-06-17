"use strict";
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
exports.onStaffMemberWrite = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
exports.onStaffMemberWrite = functions.firestore
    .document("staffMembers/{staffId}")
    .onWrite(async (change, context) => {
    const staffId = context.params.staffId;
    const before = change.before.data();
    const after = change.after.data();
    // Delete case: staffMember was deleted
    if (!after) {
        if (before === null || before === void 0 ? void 0 : before.uid) {
            await db.doc(`userProfiles/${before.uid}`).delete();
            functions.logger.info(`Deleted userProfile for uid=${before.uid} (staffMember ${staffId} deleted)`);
        }
        return;
    }
    const uid = after.uid;
    if (!uid) {
        // No uid set — nothing to sync
        return;
    }
    // If uid changed, clean up old userProfile
    if ((before === null || before === void 0 ? void 0 : before.uid) && before.uid !== uid) {
        await db.doc(`userProfiles/${before.uid}`).delete();
        functions.logger.info(`Deleted old userProfile for uid=${before.uid} (uid changed to ${uid})`);
    }
    // Write/update userProfile
    const profileData = {
        uid,
        orgId: after.orgId || "",
        staffMemberId: staffId,
        role: after.role || "STAFF",
    };
    await db.doc(`userProfiles/${uid}`).set(profileData, { merge: false });
    functions.logger.info(`Synced userProfile for uid=${uid}, role=${profileData.role}, org=${profileData.orgId}`);
});
//# sourceMappingURL=syncUserProfile.js.map