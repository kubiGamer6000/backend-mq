import OpenAI from "openai";
import { MessageWithData } from "../../types";
import dotenv from "dotenv";
import findConfig from "find-config";
import Instructor from "@instructor-ai/instructor";
import { z } from "zod";
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { db } from "../services/firebaseAdmin";
import { getEnvVar } from "../../config/env";
dotenv.config({ path: findConfig(".env") || "../../.env" });

const openai = new OpenAI({
  apiKey: getEnvVar("OPENAI_API_KEY"),
});

const client = Instructor({
  client: openai,
  mode: "FUNCTIONS",
});

export const sendToAgent = async (messageBatch: MessageWithData[]) => {
  // Get 10 last messages from Firestore
  const messageHistory = await db
    .collection("messages")
    .where("authorId", "==", messageBatch[0].from)
    .orderBy("firestoreTimestamp", "desc")
    .limit(20)
    .get();

  const messageHistoryMessages = messageHistory.docs.map((doc) => ({
    role: "user",
    content: `${doc.data().authorName}: [Message type: ${doc.data().type}] ${
      doc.data().body
    }`,
  }));

  const tools = [
    {
      type: "function",
      function: {
        name: "make_reservation",
        description:
          "Make a reservation for a car rental in Mfinity's booking system with the user with the provided information.",
        parameters: {
          type: "object",
          properties: {
            pickupLocation: { type: "string" },
            dropoffLocation: { type: "string" },
            pickupDate: { type: "string" },
            dropoffDate: { type: "string" },
            numberOfDays: { type: "number" },
            numberOfPeople: { type: "number" },
            carModel: { type: "string" },
          },
          required: [
            "pickupLocation",
            "dropoffLocation",
            "pickupDate",
            "dropoffDate",
            "numberOfDays",
            "numberOfPeople",
            "carModel",
          ],
          additionalProperties: false,
        },
        strict: true,
      },
    },
  ];

  const systemPrompt = `
    You are a real person assistant for Mfinity car rentals that helps customers find the right rental car and help the users book it. 
    You will get a list of the last messages between the user and the assistant.
    Your goal is to be helpful, guide the user and help him with what he needs but also you are trying to sell the user a car.
    Your job is to collect ALL the necessary information from the user so you can make a reservation for him.

    The current list of cars is:
    - Lambroghini Urus (300eur a day)
    - Ferrari F8 (250eur a day)
    - Porsche 911 (200eur a day)

    (for now if asked they are always all available)

    The necessary information to collect is:
    - Pickup location
    - Dropoff location
    - Pickup date
    - Dropoff date
    - Number of days
    - Number of people
    - Car model

    Your goal is to collect ALL the information from the user and indicate when you have it

    If you decide the converasation is IRRELEVANT to anything car rental related, do not respond.
  `;
  const messages: ChatCompletionMessageParam[] = messageBatch.map(
    (message) => ({
      role: "user",
      content: `${message._data.notifyName || message.from}: [Message type: ${
        message.type
      }] ${message.body}`,
    })
  );

  const schema = z.object({
    relevant: z
      .boolean()
      .describe(
        "Whether the conversation is relevant to car rentals. If not, no response will be returned"
      ),
    relevanceConfidence: z
      .number()
      .min(1)
      .max(5)
      .describe(
        "Your confidence in the relevance of the conversation from 1 to 5"
      ),
    response: z.string().describe("The response that will be sent to the user"),
    allInformationCollected: z
      .boolean()
      .describe(
        "Whether all the necessary information has been collected from the user"
      ),
  });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...messageHistoryMessages,
      ...messages,
    ],
    response_model: {
      schema,
      name: "response",
    },
  });
  return response;
};
