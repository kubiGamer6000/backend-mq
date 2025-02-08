import fs from "fs";
import path from "path";
import Instructor from "@instructor-ai/instructor";
import OpenAI from "openai";
import { z } from "zod";
import { logger } from "../worker/utils/logger";

import dotenv from "dotenv";

dotenv.config();

interface WhatsAppMessage {
  _data: any;
  body: string;
  [key: string]: any;
}

// Define the schema for a single translation
const TranslationSchema = z.object({
  originalText: z.string().describe("The original message text"),
  translatedText: z
    .string()
    .describe(
      "The English translation of the message. If the original is empty, return empty string."
    ),
});

// Define the schema for batch translations
const TranslationBatchSchema = z.object({
  translations: z
    .array(TranslationSchema)
    .describe("Array of translations for each message, including empty ones"),
});

class MessageTranslator {
  private client: ReturnType<typeof Instructor>;
  private batchSize: number;
  private baseDir: string;

  constructor(apiKey: string, batchSize = 50) {
    const oai = new OpenAI({ apiKey });
    this.client = Instructor({
      client: oai,
      mode: "FUNCTIONS",
    });
    this.batchSize = batchSize;
    this.baseDir = path.resolve(__dirname); // Get the absolute path of the current directory
  }

  private async translateBatch(messages: WhatsAppMessage[]): Promise<string[]> {
    try {
      // Map all messages to their bodies, preserving empty strings
      const textsToTranslate = messages.map((msg) => msg.body || "");

      const response = await this.client.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are a professional translator. Translate the following casual Whatsapp chat messages to English, maintaining the original tone and meaning. For empty messages, return empty strings. Make sure to keep in mind context of the conversation and the meaning of the message.",
          },
          {
            role: "user",
            content: JSON.stringify(textsToTranslate),
          },
        ],
        model: "gpt-4o",
        response_model: {
          schema: TranslationBatchSchema,
          name: "MessageTranslations",
        },
      });

      // Return translated texts, maintaining empty strings for empty inputs
      return response.translations.map((t) => t.translatedText);
    } catch (error) {
      logger.error("Translation API error:", error);
      throw error;
    }
  }

  private async processBatch(
    messages: WhatsAppMessage[]
  ): Promise<WhatsAppMessage[]> {
    // Get translations for all messages in batch
    const translations = await this.translateBatch(messages);

    // Map translations back to messages, preserving all original properties
    return messages.map((msg, index) => ({
      ...msg,
      body: translations[index],
    }));
  }

  async translateMessages(
    inputPath: string,
    outputPath: string
  ): Promise<void> {
    logger.startSection("Message Translation");

    try {
      // Resolve absolute paths
      const absoluteInputPath = path.isAbsolute(inputPath)
        ? inputPath
        : path.join(this.baseDir, inputPath);

      const absoluteOutputPath = path.isAbsolute(outputPath)
        ? outputPath
        : path.join(this.baseDir, outputPath);

      // Ensure output directory exists
      const outputDir = path.dirname(absoluteOutputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Read input file
      logger.log(`Reading input file from: ${absoluteInputPath}`);
      if (!fs.existsSync(absoluteInputPath)) {
        throw new Error(`Input file not found at: ${absoluteInputPath}`);
      }

      const rawData = fs.readFileSync(absoluteInputPath, "utf8");
      const messages: WhatsAppMessage[] = JSON.parse(rawData);

      logger.log(`Total messages to process: ${messages.length}`);

      // Process in batches
      const translatedMessages: WhatsAppMessage[] = [];
      const totalBatches = Math.ceil(messages.length / this.batchSize);

      for (let i = 0; i < messages.length; i += this.batchSize) {
        const currentBatch = Math.floor(i / this.batchSize) + 1;
        logger.log(`Processing batch ${currentBatch} of ${totalBatches}`);

        const batch = messages.slice(i, i + this.batchSize);
        const translatedBatch = await this.processBatch(batch);
        translatedMessages.push(...translatedBatch);

        // Save progress after each batch
        fs.writeFileSync(
          absoluteOutputPath,
          JSON.stringify(translatedMessages, null, 2)
        );

        logger.log(
          `Batch ${currentBatch} completed and saved. Progress: ${translatedMessages.length}/${messages.length} messages`
        );

        // Add delay between batches to avoid rate limiting
        if (i + this.batchSize < messages.length) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      logger.log(`Successfully translated ${messages.length} messages`);
      logger.endSection("Message Translation");
    } catch (error) {
      logger.error("Translation process failed:", error);
      throw error;
    }
  }
}

// Usage example
async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not found in environment variables");
  }

  const translator = new MessageTranslator(process.env.OPENAI_API_KEY);

  try {
    // Use relative paths from the translator directory
    await translator.translateMessages(
      "./messages.json",
      "./translated-messages.json"
    );
  } catch (error) {
    console.error("Translation failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { MessageTranslator };
