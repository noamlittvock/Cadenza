import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Upload a document file to Firebase Storage under the org's documents path.
 * Returns the download URL and storage path (for later deletion).
 */
export async function uploadDocument(
  orgId: string,
  file: File,
): Promise<{ url: string; path: string }> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `organizations/${orgId}/documents/${timestamp}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { url, path };
}

/**
 * Delete a document file from Firebase Storage by its storage path.
 */
export async function deleteDocument(path: string): Promise<void> {
  const storageRef = ref(storage, path);
  await deleteObject(storageRef);
}
