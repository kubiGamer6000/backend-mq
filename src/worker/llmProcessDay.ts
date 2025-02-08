// import openai sdk and enter my api key
import { OpenAI } from "openai";
import Instructor from "@instructor-ai/instructor";
import { map, z } from "zod";
import dotenv from "dotenv";
import findConfig from "find-config";
import fs from "fs";

import { telegramService } from "./services/telegram";

dotenv.config({ path: findConfig(".env") || undefined });

import type { RenderedMessage } from "../types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const instructor = Instructor({
  client: openai,
  mode: "FUNCTIONS",
});

import { db } from "./services/firebaseAdmin";

async function processDay() {
  // get all messages from the database that were from today. (fix it so it checks the date not exact timestamp)
  // Get today's start and end timestamps

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Query messages from today
  const messagesRef = db.collection("messages");
  const messages = await messagesRef
    .where("firestoreTimestamp", ">=", today)
    .where("firestoreTimestamp", "<", tomorrow)
    .orderBy("firestoreTimestamp", "asc")
    .get();

  // Sort messages into group and non-group arrays
  const groupMessages = messages.docs
    .filter((doc) => (doc.data() as RenderedMessage).isGroup === true)
    .map((doc) => doc.data() as RenderedMessage);

  const directMessages = messages.docs
    .filter((doc) => (doc.data() as RenderedMessage).isGroup === false)
    .map((doc) => doc.data() as RenderedMessage);

  // Organize group messages by groupId

  const groupChats = groupMessages.reduce(
    (acc: { [key: string]: RenderedMessage[] }, message) => {
      const groupId = message.groupId || "";
      if (!acc[groupId]) {
        acc[groupId] = [];
      }
      acc[groupId].push(message as RenderedMessage);
      return acc;
    },
    {}
  );

  // Organize direct messages by conversation between Ace and each other person
  const directChats = directMessages.reduce(
    (acc: { [key: string]: RenderedMessage[] }, message: RenderedMessage) => {
      // Determine the conversation key.
      // If the message is from Ace, conversationKey is the recipient (message.rawMsgObject.to).
      // If the message is from someone else, conversationKey is the authorId.
      const conversationKey = message.rawMsgObject.fromMe
        ? message.rawMsgObject.to
        : message.authorId;

      if (!acc[conversationKey]) {
        acc[conversationKey] = [];
      }

      acc[conversationKey].push(message);
      return acc;
    },
    {}
  );

  // //write directchats to file for debugging and end function
  // fs.writeFileSync("./directChats.json", JSON.stringify(directChats, null, 2));
  // fs.writeFileSync("./groupChats.json", JSON.stringify(groupChats, null, 2));
  // return;

  const chatSummarySchema = z.object({
    summary: z
      .string()
      .describe(
        "A detailed summary of the chat - all main topics discussed without leaving out any key information."
      ),
    keyPoints: z
      .array(
        z.object({
          keyPoint: z.string(),
          timestamp: z
            .string()
            .regex(
              /^([01]\d|2[0-3]):([0-5]\d)$/,
              "Must match hh:mm in 24-hour format"
            )
            .describe("A hh:mm timestamp of when the key point was discussed"),
        })
      )
      .describe(
        "A list of key different points and topics discussed in the chat with any conclusions."
      ),
    actionItems: z
      .array(
        z.object({
          actionItem: z.string(),
          reason: z
            .string()
            .describe(
              "A reason for why this action item is needed as a next step."
            ),
          confidence: z
            .number()
            .min(0)
            .max(5)
            .describe(
              "A confidence score for how confident you are the action item is mentioned in the chat, between 0 and 5"
            ),
        })
      )
      .describe(
        "A list of action items/next steps to be taken from the chat. (if any)"
      )
      .optional(),
    calendarEvents: z
      .array(
        z.object({
          event: z.string(),
          reason: z.string(),
          confidence: z
            .number()
            .min(0)
            .max(5)
            .describe(
              "A confidence score for how confident you are the event is mentioned and confirmed in the chat, between 0 and 5"
            ),
        })
      )
      .describe(
        "A list of calendar events to be added to the user's calendar. Only include events if they are certainly confirmed for a certain date and time and are not just ideas."
      )
      .optional(),
  });

  type ChatSummary = z.infer<typeof chatSummarySchema>;

  const systemPrompt = `
  You are an assistant working for Content Currency. Your goal is to provide a detailed summary of the WhatsApp message conversations of Ace Blond (Jesper Jernberg). He is based in Marbella and works in a team of 3 people called Content Currency. The other two members are Veli and Casper. Content Currency offers services in luxury videography,AI solutions, ecommerce, web development and SaaS.

  Ace has conversations with many people throught the day. You will be given one of those conversaions and your goal is to summarize it according to the schema provided.
  `;

  // Process each group chat conversation

  let groupChatSummaries: {
    messages: any[];
    groupId: string;
    summary: ChatSummary;
  }[] = [];

  for (const [groupId, messages] of Object.entries(groupChats)) {
    console.log(
      `Processing group chat ${groupId} with ${messages.length} messages`
    );

    const listOfMessages = messages.map((message) => ({
      isForwarded: message.rawMsgObject.isForwarded,
      isQuotedMessage: message.isQuotedMessage,
      quotedMessageBody: message.quotedMessageBody,
      messageDate: message.timestamp,
      content: `
      ${message.authorName} (${message.authorId}): [TYPE: ${message.msgType}] ${message.body}
      `,
    }));

    // TODO: Implement OpenAI processing for group chats
    try {
      const response = await instructor.chat.completions.create({
        model: "o3-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(listOfMessages) },
        ],
        response_model: {
          name: "GroupChatSummary",
          schema: chatSummarySchema,
        },
      });

      groupChatSummaries.push({
        messages: listOfMessages,
        groupId,
        summary: response,
      });
    } catch (error) {
      telegramService.sendMessage(
        `Error processing group chat ${groupId} with ${messages.length} messages: ${error}`
      );
      console.error(error);
    }
  }

  let directChatSummaries: {
    summary: ChatSummary;
    chatAuthor: string | null;
    messages: any[];
  }[] = [];
  // Process each direct chat conversation
  for (const [authorId, messages] of Object.entries(directChats)) {
    console.log(
      `Processing direct chat with ${authorId} with ${messages.length} messages`
    );
    const listOfMessages = messages.map((message) => ({
      isForwarded: message.rawMsgObject.isForwarded,
      isQuotedMessage: message.isQuotedMessage,
      quotedMessageBody: message.quotedMessageBody,
      messageDate: message.timestamp,
      content: `
        ${message.authorName} (${message.authorId}): [TYPE: ${message.msgType}] ${message.body}
        `,
    }));

    let chatAuthor: string | null = null;

    // loop over messages until you find one that has message.rawMsgObject.fromMe = false, and set chatAuthor to the authorId of that message
    for (const message of messages) {
      if (!message.rawMsgObject.fromMe) {
        chatAuthor = message.authorId;
        break;
      }
    }

    if (!chatAuthor) {
      continue;
    }

    // TODO: Implement OpenAI processing for direct chats
    const response = await instructor.chat.completions.create({
      model: "o3-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(listOfMessages) },
      ],
      response_model: {
        name: "DirectChatSummary",
        schema: chatSummarySchema,
      },
    });

    directChatSummaries.push({
      chatAuthor,
      messages: listOfMessages,
      summary: response,
    });
  }

  const summaryForAllSummariesPrompt = `
  You are an assistant working for Content Currency. Your goal is to provide a detailed summary of the WhatsApp message conversations of Ace Blond (Jesper Jernberg). He is based in Marbella and works in a team of 3 people called Content Currency. The other two members are Veli and Casper. Content Currency offers services in luxury videography,AI solutions, ecommerce, web development and SaaS.
  You are provided with a list of summaries, 1 for each direct chat or group chat in Ace's WhatsApp.
  Your goal is to summarize all the summaries into one comprehensive summary of the day, including: potential action steps, calendar items, key points and topics discussed.
  If there are conversations that are relevant to each other try to connect the dots to get even more creative ideas for the team.
  Provide the summary in a nice friendly way like you are Ace's assistant and you're walking him through the day.
  There are going to be some conversations that are very short or irrelevant to anything. Dont put emphasis on them.
  `;

  const finalSummarySchema = z.object({
    dayOverview: z
      .string()
      .describe(
        "Overview of the day. A fun brief paragraph walking through a general outline of how the day went. "
      ),
    daySummary: z
      .string()
      .describe(
        "A detailed summary of the day. A creative overview of the entire day, walking through how it went, specific conversations and connecting the dots where needed."
      ),
    keyPoints: z
      .array(z.string())
      .describe(
        "Full list of the most important things of the day that happened, were discussed or are important to know."
      ),
    actionSteps: z
      .array(z.string())
      .describe(
        "All potential action steps (not for today, since it's already the next day)"
      ),
    calendarItems: z
      .array(z.string())
      .describe("All calendar items that are confirmed for the day. Optional")
      .optional(),
    smallThingsThatMightHaveMissed: z
      .array(z.string())
      .describe(
        "A list of small things that might have been missed in the day."
      )
      .optional(),
    creativeIdeas: z
      .array(z.string())
      .describe(
        "A list of creative ideas for the team based on connecting the dots between the conversations. "
      )
      .optional(),
  });

  type FinalSummary = z.infer<typeof finalSummarySchema>;
  // summarize all summaries into one summary

  // get only the sumary and chatAuthor from each summary

  const allDirectChatSummaries = directChatSummaries.map(
    (summary) => summary.summary
  );

  const allGroupChatSummaries = groupChatSummaries.map(
    (summary) => summary.summary
  );

  const allSummariesSummary = await instructor.chat.completions.create({
    model: "o1",
    messages: [
      { role: "system", content: summaryForAllSummariesPrompt },
      {
        role: "user",
        content: `Direct Chat Summaries: ${JSON.stringify(
          allDirectChatSummaries
        )}`,
      },
      {
        role: "user",
        content: `Group Chat Summaries: ${JSON.stringify(
          allGroupChatSummaries
        )}`,
      },
    ],
    response_model: {
      name: "DailySummary",
      schema: finalSummarySchema,
    },
  });

  const formattedSummary = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `This is a summary of Ace's entire day. Its in a json format to ensure standartization. Please format it into a normal text response, with formatting for telegram. Do not change any of the actual contents.`,
      },
      { role: "user", content: JSON.stringify(allSummariesSummary) },
    ],
  });

  //write all summaries to a file
  fs.writeFileSync(
    "./allSummariesSummary.json",
    JSON.stringify(allSummariesSummary, null, 2)
  );
  fs.writeFileSync(
    "./formattedSummary.json",
    JSON.stringify(formattedSummary, null, 2)
  );
  fs.writeFileSync(
    "./directChatSummaries.json",
    JSON.stringify(directChatSummaries, null, 2)
  );
  fs.writeFileSync(
    "./groupChatSummaries.json",
    JSON.stringify(groupChatSummaries, null, 2)
  );
  telegramService.sendMessage(
    formattedSummary.choices[0].message.content ||
      "No summary found. Please check the logs."
  );
}

processDay();
