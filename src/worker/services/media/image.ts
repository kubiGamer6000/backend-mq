import { OpenAI } from "openai";
import dotenv from "dotenv";
import fs from "fs";
import { logger } from "../../../utils/logger";

dotenv.config();

export class ImageProcessor {
  private openai: OpenAI;
  private prompt: string;

  constructor(apiKey: string, prompt?: string) {
    this.openai = new OpenAI({ apiKey });
    this.prompt = prompt || "Describe this image in detail.";
  }

  async processImage(filePath: string): Promise<string | null> {
    try {
      logger.setPrefix("Image Processing").log("Reading image file");

      const base64Image = fs.readFileSync(filePath, "base64");

      logger.log("Sending to GPT-4o Vision");
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: this.prompt },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64Image}` },
              },
            ],
          },
        ],
      });

      return response.choices[0].message.content;
    } catch (error) {
      logger.error("Image processing failed", error);
      return null;
    }
  }
}
