const { MessageTypes } = require("whatsapp-web.js");
import { MessageWithData, RenderedMessage } from "../types";
import { VoiceProcessor } from "./services/media/voice";
import { ImageProcessor } from "./services/media/image";
import { MediaDownloader } from "./services/media/downloader";
import { logger } from "../utils/logger";
import { getEnvVar } from "../config/env";

// Initialize services
const voiceProcessor = new VoiceProcessor(getEnvVar("OPENAI_API_KEY"));
const imageProcessor = new ImageProcessor(
  getEnvVar("OPENAI_API_KEY"),
  getEnvVar("IMAGE_PROMPT")
);
const mediaDownloader = new MediaDownloader();

function formatQuotedMessageBody(quotedMsg: any): string | null {
  if (!quotedMsg) return null;

  if (quotedMsg.type === "image") return "[image]";
  if (["voice", "audio"].includes(quotedMsg.type)) return "[voice]";
  if (!quotedMsg.body) return null;

  return quotedMsg.body.length > 100
    ? `${quotedMsg.body.slice(0, 100)}...`
    : quotedMsg.body;
}

async function renderMessage(msg: MessageWithData): Promise<RenderedMessage> {
  logger.startSection("Message Rendering");

  const timestamp = new Date(msg.timestamp * 1000).toLocaleString();
  const authorName = msg._data.notifyName || "Unknown User";
  const isGroup = msg.from.endsWith("@g.us");
  const chatId = msg.from.replace(/[@].+$/, "");

  let body: string | null = null;
  let mediaPath: string | null = null;
  let mediaType: string | null = null;
  let isVoiceMessage = false;
  let isImage = false;
  let didInterpreterFail = false;

  // Handle media download if present
  if (msg.hasMedia) {
    const media = await mediaDownloader.downloadMedia(msg, chatId);
    if (media) {
      mediaPath = media.tempPath;
      mediaType = media.mediaType;
    }
  }

  // Process message based on type
  switch (msg.type) {
    case MessageTypes.TEXT:
    case MessageTypes.CIPHERTEXT:
      body = msg.body;
      break;

    case MessageTypes.AUDIO:
    case MessageTypes.VOICE:
      isVoiceMessage = true;
      body = mediaPath ? await voiceProcessor.processVoice(mediaPath) : null;
      if (!body) {
        body = `[${msg.type.toLowerCase()} message]`;
        didInterpreterFail = true;
      }
      break;

    case MessageTypes.IMAGE:
      isImage = true;
      body = mediaPath ? await imageProcessor.processImage(mediaPath) : null;
      if (!body) {
        body = "[no image description available]";
        didInterpreterFail = true;
      }
      break;

    case MessageTypes.VIDEO:
      body = "[video]";
      break;

    case MessageTypes.DOCUMENT:
      body = `[file "${msg.body}"]`;
      break;

    case MessageTypes.STICKER:
      body = "[sticker]";
      break;

    case MessageTypes.LOCATION:
      body = "[location]";
      break;

    case MessageTypes.CONTACT:
    case MessageTypes.CONTACT_VCARD:
    case MessageTypes.CONTACT_CARD:
      body = "[shared contact]";
      break;

    case MessageTypes.REVOKED:
      body = "[message deleted]";
      break;

    case MessageTypes.E2E_NOTIFICATION:
    case MessageTypes.GP2:
    case MessageTypes.GROUP_NOTIFICATION:
      body = msg.body;
      break;

    default:
      body = `[unsupported message type: ${msg.type}]`;
  }

  logger.log(`Processed ${msg.type} message`);
  logger.endSection("Message Rendering");

  return {
    uid: msg.id,
    timestamp,
    authorName,
    authorId: msg.author || msg.from,
    isFromMe: msg.id.fromMe,
    isGroup,
    groupId: isGroup ? msg.from : null,
    msgType: msg.type,
    body,
    mediaPath,
    mediaType,
    isQuotedMessage: msg.hasQuotedMsg,
    quotedMessageType: msg._data.quotedMsg?.type || null,
    quotedMessageBody: formatQuotedMessageBody(msg._data.quotedMsg),
    quotedMessageObject: msg._data.quotedMsg || null,
    isVoiceMessage,
    isImage,
    didInterpreterFail,
    rawMsgObject: msg,
  };
}

export default renderMessage;
