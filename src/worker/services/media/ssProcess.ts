import { RenderedMessage } from "../../../types";
import { db } from "../firebaseAdmin";
import { OpenAI } from "openai";
import { telegramService } from "../telegram";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const preProcess = async (rendered: RenderedMessage) => {
  let newBody = rendered.body;
  if (rendered.groupId === "120363374717597053@g.us") {
    if (!rendered.rawMsgObject.hasMedia) {
      // Translate message with chatgpt, get last 5 messages from group to give context (from firestore by querying messages for groupID and sorting by timestamp descending)
      const messages = await db
        .collection("messages")
        .where("groupId", "==", rendered.groupId)
        .orderBy("timestamp", "desc")
        .limit(5)
        .get();
      const context = messages.docs.map((doc) => doc.data());
      // get only the message authors and body and send them to chatgpt along with current message and prompt
      const prompt = `
        Translate the following Whatsapp group message to English (if its not already):
        ${rendered.body}
        Context, previous 5 messages:
        ${context.map((msg) => `${msg.authorName}: ${msg.body}`).join("\n")}

        Output ONLY the translated message, NEVER anything else. IF the message is already in English, just return it as is.
        `;
      const translated = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });
      newBody = translated.choices[0].message.content;
    }
    await telegramService.sendMessage(
      `${rendered.authorName}: ${
        newBody === rendered.body
          ? newBody
          : newBody + "\n\n(Original: " + rendered.body + ")"
      } ${rendered.mediaPath ? `\n\nMedia link: ${rendered.mediaPath}` : ""}`,
      true
    );
  }
};
