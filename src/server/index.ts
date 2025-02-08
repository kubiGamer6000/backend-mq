import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import qr from "qr-image";

import fs from "fs";
import { logger } from "../utils/logger";
import { telegramService } from "../worker/services/telegram";
import { publishMessage, publishEditEvent } from "./rabbitmq";
import type { MessageWithData } from "../types";

import express from "express";
import { getEnvVar } from "../config/env";

const app = express();

import dotenv from "dotenv";
import findConfig from "find-config";
dotenv.config({ path: findConfig(".env") || "../.env" });

const client = new Client({
  puppeteer: {
    args: ["--no-sandbox"],
  },
  authStrategy: new LocalAuth({
    clientId: getEnvVar("WHATSAPP_CLIENT_ID"),
  }),
});
client.on("qr", async (qrData) => {
  logger.startSection("QR Code Generation");
  logger.log("QR code received");

  qrcode.generate(qrData, { small: true });

  const qrImage = qr.image(qrData, { type: "png" });
  const randomId = Math.random().toString(36).substring(2, 15);
  const filePath = `./qrs/qr_code_${randomId}.png`;

  // Ensure qrs directory exists
  if (!fs.existsSync("./qrs")) {
    fs.mkdirSync("./qrs", { recursive: true });
  }

  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    qrImage.pipe(writeStream);
    writeStream.on("finish", () => resolve(undefined));
    writeStream.on("error", reject);
  });

  // Send both photo and notification
  await telegramService.sendPhoto(filePath, "New WhatsApp QR Code");

  // Cleanup
  fs.unlinkSync(filePath);

  logger.endSection("QR Code Generation");
});

client.on("message_create", async (message: MessageWithData) => {
  logger.startSection("Message Received");
  logger.log(
    `Publishing message to RabbitMq (from ${
      message._data.notifyName || message.from
    })`
  );

  await publishMessage("chat_message_queue", message);

  logger.endSection("Message Received");
});

client.on(
  "message_edit",
  async (message: MessageWithData, newBody: string, prevBody: string) => {
    logger.startSection("Message Edit");
    logger.log(`Publishing edit event to RabbitMq`);

    await publishEditEvent("chat_edit_message_queue", {
      message,
      newBody,
      prevBody,
    });

    logger.endSection("Message Edit");
  }
);

client.on("ready", async () => {
  logger.log("WhatsApp client is ready");
});

client.on("auth_failure", async (msg) => {
  logger.error("Authentication failed", msg);
  await telegramService.sendError(`Authentication failed: ${msg}`);
});

client.on("disconnected", async (reason) => {
  logger.error("Client disconnected", reason);
  await telegramService.sendError(`Client disconnected: ${reason}`);
});

process.on("unhandledRejection", async (reason, promise) => {
  logger.error("Unhandled Rejection", { reason, promise });
  await telegramService.sendError(
    `Unhandled Rejection at: ${promise} reason: ${reason}`
  );
});

app.get("/downloadMedia", async (req, res) => {
  const { messageId } = req.query;
  const message = await client.getMessageById(messageId?.toString() || "");
  const media = await message.downloadMedia();

  res.send(media);
});

client.initialize();

app.listen(3000, () => {
  logger.log("Server is running on port 3000");
});
