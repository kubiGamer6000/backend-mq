import type { Message, MessageId } from "whatsapp-web.js";

export type MessageWithData = Message & { _data: any };

export interface RenderedMessage {
  uid: MessageId;
  timestamp: string;
  authorName: string;
  authorId: string;
  isFromMe: boolean;
  isGroup: boolean;
  groupId: string | null;
  msgType: string;
  body: string | null;
  mediaPath: string | null;
  mediaType: string | null;
  isQuotedMessage: boolean;
  quotedMessageType: string | null;
  quotedMessageBody: string | null;
  quotedMessageObject: any | null;
  isVoiceMessage: boolean;
  isImage: boolean;
  didInterpreterFail: boolean;
  editHistory?: {
    prevBody: string;
    newBody: string;
    timestamp: string;
  }[];
  rawMsgObject: MessageWithData;
}

export interface MediaDownloadResult {
  tempPath: string;
  mediaType: string;
}
