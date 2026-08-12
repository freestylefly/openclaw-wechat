import type { WechatMessageContext } from "./types.js";

export type InboundWeChatMedia = {
  url: string;
  mimeType?: string;
  modality: "image" | "video";
};

export type InboundWeChatMediaContext = {
  SourceModality: "text" | "image" | "video";
  MediaUrl?: string;
  MediaUrls?: string[];
  MediaType?: string;
  MediaTypes?: string[];
};

export function resolveInboundWeChatMedia(
  message: WechatMessageContext
): InboundWeChatMedia | undefined {
  if (message.type !== "image" && message.type !== "video") return undefined;

  const url = message.content.trim();
  if (!url) return undefined;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return undefined;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") return undefined;

  const reportedType = message.contentType?.trim();
  const mimeType = reportedType?.toLowerCase().startsWith(`${message.type}/`)
    ? reportedType
    : undefined;

  return { url, mimeType, modality: message.type };
}

export function buildInboundWeChatMediaContext(
  media: InboundWeChatMedia | undefined
): InboundWeChatMediaContext {
  if (!media) return { SourceModality: "text" };

  return {
    SourceModality: media.modality,
    MediaUrl: media.url,
    MediaUrls: [media.url],
    MediaType: media.mimeType,
    MediaTypes: media.mimeType ? [media.mimeType] : undefined,
  };
}
