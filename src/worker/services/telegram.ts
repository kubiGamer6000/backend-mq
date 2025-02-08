import TelegramBot from "node-telegram-bot-api";
import { logger } from "../../utils/logger";
import fs from "fs";
import findConfig from "find-config";
import dotenv from "dotenv";
import { getEnvVar } from "../../config/env";
dotenv.config({ path: findConfig(".env") || undefined });

export class TelegramService {
  private primaryBot: TelegramBot;
  private secondaryBot: TelegramBot | null = null;
  private primaryChatId: string;
  private secondaryChatId: string | null = null;

  constructor() {
    const token = getEnvVar("TELEGRAM_BOT_TOKEN");
    const chatId = getEnvVar("TELEGRAM_CHAT_ID");

    this.primaryBot = new TelegramBot(token, {
      polling: false,
    });
    this.primaryChatId = chatId;

    // Initialize secondary bot if credentials exist
    if (getEnvVar("TELEGRAM_BOT_TOKEN_SECONDARY")) {
      this.secondaryBot = new TelegramBot(
        getEnvVar("TELEGRAM_BOT_TOKEN_SECONDARY"),
        { polling: false }
      );
      this.secondaryChatId = chatId;
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
