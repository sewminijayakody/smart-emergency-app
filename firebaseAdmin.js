// firebaseAdmin.js
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!admin.apps.length) {
  try {
    // You can either set GOOGLE_APPLICATION_CREDENTIALS to the JSON path
    // or place serviceAccountKey.json next to this file.
    const credPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      path.join(__dirname, 'serviceAccountKey.json');

    const raw = fs.readFileSync(credPath, 'utf8');
    const serviceAccount = JSON.parse(raw);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('[FCM] Firebase Admin initialized');
  } catch (err) {
    console.error('[FCM] Failed to initialize Firebase Admin:', err.message);
  }
}

export default admin;
