import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInboundWeChatMediaContext,
  resolveInboundWeChatMedia,
} from "../src/inbound-media.js";
import { convertToMessageContext } from "../src/callback-server.js";
import type { WechatMessageContext } from "../src/types.js";

function createMessage(
  type: WechatMessageContext["type"],
  content: string,
  contentType?: string
): WechatMessageContext {
  return {
    id: "message-id",
    type,
    sender: { id: "sender-id", name: "Sender" },
    recipient: { id: "recipient-id" },
    content,
    contentType,
    timestamp: 1,
    threadId: "sender-id",
    raw: {},
  };
}

describe("inbound WeChat media", () => {
  it("preserves the image URL and matching MIME type", () => {
    const media = resolveInboundWeChatMedia(
      createMessage("image", "https://media.example/image.png", "image/png")
    );

    assert.deepEqual(media, {
      url: "https://media.example/image.png",
      mimeType: "image/png",
      modality: "image",
    });
  });

  it("accepts video URLs without trusting a mismatched MIME type", () => {
    const media = resolveInboundWeChatMedia(
      createMessage("video", "https://media.example/video.mp4", "image/png")
    );

    assert.deepEqual(media, {
      url: "https://media.example/video.mp4",
      mimeType: undefined,
      modality: "video",
    });
  });

  it("maps media into the OpenClaw inbound context", () => {
    const media = resolveInboundWeChatMedia(
      createMessage("image", "https://media.example/image.png", "image/png")
    );

    assert.deepEqual(buildInboundWeChatMediaContext(media), {
      SourceModality: "image",
      MediaUrl: "https://media.example/image.png",
      MediaUrls: ["https://media.example/image.png"],
      MediaType: "image/png",
      MediaTypes: ["image/png"],
    });
    assert.deepEqual(buildInboundWeChatMediaContext(undefined), {
      SourceModality: "text",
    });
  });

  it("rejects non-media messages and non-HTTP media references", () => {
    assert.equal(
      resolveInboundWeChatMedia(createMessage("text", "https://media.example/image.png")),
      undefined
    );
    assert.equal(
      resolveInboundWeChatMedia(createMessage("image", "/tmp/image.png")),
      undefined
    );
  });

  it("propagates flat and nested callback MIME types", () => {
    const flat = convertToMessageContext({
      messageType: "60002",
      wcId: "recipient-id",
      fromUser: "sender-id",
      content: "https://media.example/image.png",
      contentType: "image/png",
      newMsgId: "flat-id",
    });
    const nested = convertToMessageContext({
      messageType: "60003",
      wcId: "recipient-id",
      data: {
        fromUser: "sender-id",
        content: "https://media.example/video.mp4",
        contentType: "video/mp4",
        newMsgId: "nested-id",
      },
    });

    assert.equal(flat?.contentType, "image/png");
    assert.equal(nested?.contentType, "video/mp4");
  });
});
