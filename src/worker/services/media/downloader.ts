import fs from "fs";
import path from "path";
import pkg from "whatsapp-web.js";
import type { MessageMedia } from "whatsapp-web.js";

import { MessageWithData, MediaDownloadResult } from "../../../types";
import { logger } from "../../../utils/logger";
import mime from "mime-types";
import dotenv from "dotenv";

dotenv.config();

export class MediaDownloader {
  async downloadMedia(
    message: MessageWithData,
    chatId: string
  ): Promise<MediaDownloadResult | null> {
    try {
      logger.setPrefix("Media Download").log("Downloading media");

      const mediaData = await fetch(
        `http://localhost:3000/downloadMedia?messageId=${message.id._serialized}`
      );

      const media: MessageMedia = await mediaData.json();

      const chatDir = path.join(
        __dirname,
        "..",
        "..",
        process.env.TEMP_DIR || ".temp",
        chatId
      );

      // Ensure chat directory exists
      fs.mkdirSync(chatDir, { recursive: true });

      // Create unique temp file path
      const tempPath = path.join(
        chatDir,
        `${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 15)}.${mime.extension(media.mimetype)}`
      );

      logger.log(`Saving media to ${tempPath}`);
      fs.writeFileSync(tempPath, media.data, "base64");

      return { tempPath, mediaType: media.mimetype };
    } catch (error) {
      logger.error("Media download failed", error);
      return null;
    }
  }
}
