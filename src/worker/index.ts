import dotenv from "dotenv";
import findConfig from "find-config";

import fs from "fs";
import renderMessage from "./renderMessage";
import { firebaseService } from "./services/firebase";
import { telegramService } from "./services/telegram";
import { logger } from "../utils/logger";
import { preProcess } from "./services/media/ssProcess";

import { sendToAgent } from "./agent";

import type { MessageWithData } from "../types";
import amqp from "amqplib";
dotenv.config({ path: findConfig(".env") || undefined });

let userBuffers: {
  [key: string]: {
    messages: MessageWithData[];
    timeout: NodeJS.Timeout | null;
  };
} = {};

async function startWorker() {
  const connection = await amqp.connect(
    process.env.RABBITMQ_URL || "amqp://localhost"
  );
  const channel = await connection.createChannel();
  await channel.assertQueue("chat_message_queue", { durable: true });
  await channel.assertQueue("chat_edit_message_queue", { durable: true });

  channel.consume("chat_message_queue", async (msg) => {
    if (!msg) {
      logger.error("No message received");
      return;
    }

    const message: MessageWithData = JSON.parse(msg.content.toString());
    const { replyTo, correlationId } = msg.properties;

    if (!userBuffers[message.from])
      userBuffers[message.from] = { messages: [], timeout: null };

    userBuffers[message.from].messages.push(message);

    // if (!message.fromMe)
    //   scheduleAgentProcessing(message.from, channel, replyTo, correlationId);

    try {
      await renderAndStoreMessage(message);

      channel.ack(msg); // Acknowledge successful processing
    } catch (error) {
      console.error("Error processing message:", error);
      await telegramService.sendError(`Error processing message: ${error}`);
      channel.nack(msg); // Requeue the message if processing fails
    }
  });

  channel.consume("chat_edit_message_queue", async (msg) => {
    if (!msg) {
      logger.error("No message received");
      return;
    }
    try {
      const messageEdit: {
        message: MessageWithData;
        newBody: string;
        prevBody: string;
      } = JSON.parse(msg.content.toString());
      await editMessage(
        messageEdit.message,
        messageEdit.newBody,
        messageEdit.prevBody
      );

      channel.ack(msg); // Acknowledge successful processing
    } catch (error) {
      console.error("Error processing edit to message:", error);
      channel.nack(msg); // Requeue the message if processing fails
    }
  });
}

startWorker();

// const processMessageBatch = async (messages: MessageWithData[]) => {
//   logger.startSection(`${messages.length} Messages Batch Processing`);
//   for (const message of messages) {
//     await renderAndStoreMessage(message);
//   }
//   logger.endSection(`${messages.length} Messages Batch Processing`);
// };

const renderAndStoreMessage = async (message: MessageWithData) => {
  logger.startSection("Message Processing");

  try {
    const rendered = await renderMessage(message);

    if (rendered.mediaPath) {
      const localFilePath = rendered.mediaPath;
      const chatId = message.from.replace(/[@].+$/, "");

      rendered.mediaPath = await firebaseService.uploadMedia(
        localFilePath,
        chatId,
        rendered.mediaType
      );

      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    }

    await preProcess(rendered);

    await firebaseService.storeMessage(rendered);

    logger.endSection("Message Processing");
  } catch (error) {
    logger.error("Error processing message", error);
    await telegramService.sendError(`Error processing message: ${error}`);
  }
};

const editMessage = async (
  message: MessageWithData,
  newBody: string,
  prevBody: string
) => {
  // Check if the message is stored in Firestore
  logger.startSection("Message Edit");
  logger.log(`Message edited from ${prevBody} to ${newBody}`);
  logger.log(`Updating Firestore`);

  const docId = await firebaseService.editMessage(message, prevBody, newBody);
  if (!docId) {
    logger.log("Message not found in Firestore");
    return;
  }
  logger.log(`Message updated in Firestore: ${docId}`);

  logger.endSection("Message Edit");
  // Update the message in Firestore, keeping count of edits
};

// function scheduleAgentProcessing(
//   userId: string,
//   channel: amqp.Channel,
//   replyTo: string,
//   correlationId: string
// ) {
//   if (userBuffers[userId].timeout) clearTimeout(userBuffers[userId].timeout);

//   userBuffers[userId].timeout = setTimeout(async () => {
//     const messageBatch = userBuffers[userId].messages;
//     const lastMessage = messageBatch[messageBatch.length - 1]; // Get the last message

//     const agentResponse = await sendToAgent(messageBatch);

//     if (agentResponse.relevant) {
//       // Only send response for the last message's correlation ID
//       if (lastMessage === messageBatch[messageBatch.length - 1]) {
//         channel.sendToQueue(
//           replyTo,
//           Buffer.from(JSON.stringify(agentResponse)),
//           {
//             correlationId,
//           }
//         );
//       }
//     }

//     delete userBuffers[userId]; // Clear buffer
//   }, 10000); // 10-second delay
// }
