import TelegramBot from "node-telegram-bot-api";
import { logger } from "../../utils/logger";
import fs from "fs";
import findConfig from "find-config";
import dotenv from "dotenv";
dotenv.config({ path: findConfig(".env") || undefined });

export class TelegramService {
  private primaryBot: TelegramBot;
  private secondaryBot: TelegramBot | null = null;
  private primaryChatId: string;
  private secondaryChatId: string | null = null;

  constructor() {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      throw new Error("Telegram environment variables not set");
    }

    this.primaryBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
      polling: false,
    });
    this.primaryChatId = process.env.TELEGRAM_CHAT_ID;

    // Initialize secondary bot if credentials exist
    if (
      process.env.TELEGRAM_BOT_TOKEN_SECONDARY &&
      process.env.TELEGRAM_CHAT_ID
    ) {
      this.secondaryBot = new TelegramBot(
        process.env.TELEGRAM_BOT_TOKEN_SECONDARY,
        {
          polling: false,
        }
      );
      this.secondaryChatId = process.env.TELEGRAM_CHAT_ID;
    }
  }

  async sendMessage(
    message: string,
    useSecondary: boolean = false
  ): Promise<void> {
    try {
      if (useSecondary && this.secondaryBot && this.secondaryChatId) {
        await this.secondaryBot.sendMessage(this.secondaryChatId, message);
      } else {
        await this.primaryBot.sendMessage(this.primaryChatId, message);
      }
    } catch (error) {
      logger.error("Failed to send Telegram message", error);
    }
  }

  async sendPhoto(
    photoPath: string,
    caption?: string,
    useSecondary: boolean = false
  ): Promise<void> {
    try {
      const photo = fs.createReadStream(photoPath);
      if (useSecondary && this.secondaryBot && this.secondaryChatId) {
        await this.secondaryBot.sendPhoto(this.secondaryChatId, photo, {
          caption: caption,
        });
      } else {
        await this.primaryBot.sendPhoto(this.primaryChatId, photo, {
          caption: caption,
        });
      }
    } catch (error) {
      logger.error("Failed to send Telegram photo", error);
    }
  }

  async sendError(error: string, useSecondary: boolean = false): Promise<void> {
    try {
      if (useSecondary && this.secondaryBot && this.secondaryChatId) {
        await this.secondaryBot.sendMessage(
          this.secondaryChatId,
          `❌ ERROR: ${error}`
        );
      } else {
        await this.primaryBot.sendMessage(
          this.primaryChatId,
          `❌ ERROR: ${error}`
        );
      }
    } catch (err) {
      logger.error("Failed to send Telegram error message", err);
    }
  }
}

export const telegramService = new TelegramService();
