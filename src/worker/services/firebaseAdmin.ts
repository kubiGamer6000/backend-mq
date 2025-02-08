import admin from "firebase-admin";
import dotenv from "dotenv";
import findConfig from "find-config";

dotenv.config({ path: findConfig(".env") || undefined });

function getServiceAccount() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not set");
  }

  try {
    const buff = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64");
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
