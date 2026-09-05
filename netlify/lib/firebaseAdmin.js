const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

function getFirebaseAdmin() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    throw new Error("Falta FIREBASE_SERVICE_ACCOUNT_BASE64");
  }

  if (getApps().length === 0) {
    const serviceAccountJson = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
      "base64"
    ).toString("utf8");

    const serviceAccount = JSON.parse(serviceAccountJson);

    initializeApp({
      credential: cert(serviceAccount)
    });
  }

  return {
    db: getFirestore(),
    auth: getAuth()
  };
}

module.exports = { getFirebaseAdmin };