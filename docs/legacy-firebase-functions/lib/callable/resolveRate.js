"use strict";
/**
 * resolveRate — Cloud Function callable (stub)
 *
 * Section 08: Billing Resolution Logic
 * Resolves the rate for an EventParticipant at event creation time.
 * Creates an immutable RateSnapshot on the EventParticipant document.
 *
 * Implementation deferred to Phase 5.
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
exports.resolveRate = void 0;
const functions = __importStar(require("firebase-functions"));
exports.resolveRate = functions.https.onCall(async (_data, _context) => {
    throw new functions.https.HttpsError("unimplemented", "resolveRate is not yet implemented. Available in Phase 5.");
});
//# sourceMappingURL=resolveRate.js.map