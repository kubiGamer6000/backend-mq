import { admin, db } from "./firebaseAdmin";
import { MessageWithData, RenderedMessage } from "../../types";
import { logger } from "../../utils/logger";
import fs from "fs";
import path from "path";
import { getEnvVar } from "../../config/env";
export class FirebaseService {
  private bucket;

  constructor() {
    this.bucket = admin.storage().bucket(getEnvVar("FIREBASE_STORAGE_BUCKET"));
  }

  async uploadMedia(
    localFilePath: string,
    chatId: string,
    mediaType: string | null
  ): Promise<string> {
    logger.setPrefix("Firebase Storage");

    const timestamp = new Date().getTime();
    const filename = `${chatId}/${timestamp}_${path.basename(localFilePath)}`;

    logger.log(`Uploading file to path: ${filename}`);

    await this.bucket.upload(localFilePath, {
      destination: filename,
      metadata: {
        contentType: mediaType || "application/octet-stream",
      },
    });

    return filename;
  }

  async storeMessage(rendered: RenderedMessage): Promise<string> {
    logger.setPrefix("Firestore");
    logger.log("Storing message");
    const docId = `${rendered.authorId.replace(/[@].+$/, "")}-${
      rendered.uid.id
    }`;
    // check if the message already exists
    const doc = await db.collection("messages").doc(docId).get();
    if (doc.exists) {
      logger.log("Message already exists");
      return docId;
    }
    await db
      .collection("messages")
      .doc(docId)
      .set({
        ...rendered,
        firestoreTimestamp: admin.firestore.Timestamp.fromDate(
          new Date(rendered.timestamp)
        ),
        rawMsgObject: JSON.parse(JSON.stringify(rendered.rawMsgObject)),
      });
    return docId;
  }

  async editMessage(
    rawMsg: MessageWithData,
    prevBody: string,
    newBody: string
  ): Promise<string | null> {
    logger.setPrefix("Firestore");
    logger.log("Editing message");

    // check if the message exists
    const docId = `${rawMsg.from.replace(/[@].+$/, "")}-${rawMsg.id.id}`;
    const doc = await db.collection("messages").doc(docId).get();
    if (!doc.exists) {
      logger.log("Message does not exist");
      return null;
    }
    // add to the edit history
    const editHistory = doc.data()?.editHistory || [];
    editHistory.push({
      prevBody,
      newBody,
      timestamp: new Date().toISOString(),
    });
    await doc.ref.update({
      editHistory,
      body: newBody,
    });
    return docId;
  }
}

export const firebaseService = new FirebaseService();
