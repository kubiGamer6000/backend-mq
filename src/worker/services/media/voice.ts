import { OpenAI } from "openai";
const ffmpeg = require("fluent-ffmpeg");
import ffmpegPath from "ffmpeg-static";
import fs from "fs";
import { logger } from "../../../utils/logger";
import dotenv from "dotenv";
import findConfig from "find-config";
dotenv.config({ path: findConfig(".env") || undefined });

ffmpeg.setFfmpegPath(ffmpegPath);

export class VoiceProcessor {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async processVoice(filePath: string): Promise<string | null> {
    try {
      logger.setPrefix("Voice Processing").log("Converting audio to MP3");

      const mp3Path = `${filePath}.mp3`;

      // Convert to MP3
      await this.convertToMp3(filePath, mp3Path);

      logger.log("Transcribing audio");
      const transcript = await this.transcribe(mp3Path);

      // Cleanup
      fs.unlinkSync(mp3Path);

      return transcript;
    } catch (error) {
      logger.error("Voice processing failed", error);
      return null;
    }
  }

  private async convertToMp3(
    inputPath: string,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat("mp3")
        .on("end", resolve)
        .on("error", reject)
        .save(outputPath);
    });
  }

  private async transcribe(mp3Path: string): Promise<string> {
    const transcript = await this.openai.audio.transcriptions.create({
      file: fs.createReadStream(mp3Path),
      model: "whisper-1",
    });
    return transcript.text;
  }
}
