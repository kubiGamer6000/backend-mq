// src/server/rabbitmq.js
import amqp from "amqplib";
import { v4 as uuidv4 } from "uuid";
import type { MessageWithData } from "../types";
import dotenv from "dotenv";

dotenv.config();

let channel: amqp.Channel | null = null;
let connection: amqp.Connection | null = null;
let replyQueue: string;

async function connectRabbitMQ() {
  connection = await amqp.connect(
    process.env.RABBITMQ_URL || "amqp://localhost"
  );
  channel = await connection.createChannel();
  await channel.assertQueue("chat_message_queue", { durable: true });
  await channel.assertQueue("chat_edit_message_queue", { durable: true });
  const { queue: replyQueueName } = await channel.assertQueue("", {
    exclusive: true,
  });
  replyQueue = replyQueueName;
}

export async function publishMessage(queue: string, message: MessageWithData) {
  if (!channel) await connectRabbitMQ();

  const correlationId = uuidv4();
  channel?.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
    persistent: true,
    correlationId,
    replyTo: replyQueue,
  });

  return new Promise((resolve) => {
    channel?.consume(
      replyQueue,
      (msg) => {
        if (msg?.properties.correlationId === correlationId) {
          resolve(msg?.content.toString() || null);
        }
      },
      { noAck: true }
    );
  });
}

export async function publishEditEvent(
  queue: string,
  messageEdit: {
    message: MessageWithData;
    newBody: string;
    prevBody: string;
  }
) {
  if (!channel) await connectRabbitMQ();
  channel?.sendToQueue(queue, Buffer.from(JSON.stringify(messageEdit)), {
    persistent: true,
  });
}
