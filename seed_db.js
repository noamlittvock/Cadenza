const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function seed() {
    await db.collection('organizations').doc('alpert').set({
        name: 'Alpert Music Center',
        createdAt: new Date().toISOString()
    });

    await db.collection('access_control').doc('noam.littvock@gmail.com').set({
        allowed: true,
        role: 'ADMIN',
        orgId: 'alpert',
        createdAt: new Date().toISOString()
    }, { merge: true });

    console.log('Successfully seeded alpert organization and admin user.');
}

seed().catch(console.error);
