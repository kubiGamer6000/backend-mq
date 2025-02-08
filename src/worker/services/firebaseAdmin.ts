import admin from "firebase-admin";
import { getEnvVar } from "../../config/env";

function getServiceAccount() {
  const serviceAccount = getEnvVar("FIREBASE_SERVICE_ACCOUNT");
  try {
    const buff = Buffer.from(serviceAccount, "base64");
    return JSON.parse(buff.toString("utf-8"));
  } catch (error) {
    console.error("Error parsing service account:", error);
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT format");
  }
}

admin.initializeApp({
  credential: admin.credential.cert(getServiceAccount()),
});

const db = admin.firestore();

export { admin, db };
