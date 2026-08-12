import http from "http";
import type { WechatMessageContext } from "./types.js";

interface CallbackServerOptions {
  port: number;
  apiKey: string;
  onMessage: (message: WechatMessageContext) => void;
  abortSignal?: AbortSignal;
}

export async function startCallbackServer(
  options: CallbackServerOptions
): Promise<{ port: number; stop: () => void }> {
  const { port, onMessage, abortSignal } = options;

  const server = http.createServer((req, res) => {
    // URL may include query params, so use startsWith
    const url = req.url?.split("?")[0] || "";
    if (url === "/webhook/wechat" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body);
          const message = convertToMessageContext(payload);

          if (message) {
            onMessage(message);
          }

          res.writeHead(200).end("OK");
        } catch (err) {
          console.error("Failed to process webhook:", err);
          res.writeHead(400).end("Bad Request");
        }
      });
    } else {
      res.writeHead(404).end("Not Found");
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, "0.0.0.0", () => {
      console.log(`📡 Webhook server listening on 0.0.0.0:${port}`);
      console.log(`   Endpoint: http://localhost:${port}/webhook/wechat`);

      const stop = () => {
        server.close(() => {
          console.log(`📡 Webhook server on port ${port} stopped`);
        });
      };

      abortSignal?.addEventListener("abort", stop);

      resolve({ port, stop });
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Normalize the incoming payload into a flat shape.
 *
 * Two formats may arrive:
 *  1. 苍何服务云 raw: `{ messageType, wcId, data: { fromUser, content, newMsgId, ... } }`
 *  2. Proxy flat:  `{ messageType, wcId, fromUser, content, newMsgId, contentType, raw, ... }`
 *
 * We detect the proxy format by checking whether `fromUser` exists at the top level.
 */
function normalizePayload(payload: any): {
  messageType: string;
  wcId: string;
  fromUser: string;
  toUser?: string;
  fromGroup?: string;
  content: string;
  newMsgId?: string | number;
  timestamp?: number;
  contentType?: string;
  raw: any;
} {
  const { messageType, wcId } = payload;

  // Proxy flat format: fromUser is at top level
  if (payload.fromUser) {
    return {
      messageType,
      wcId,
      fromUser: payload.fromUser,
      toUser: payload.toUser,
      fromGroup: payload.fromGroup,
      content: payload.content ?? "",
      newMsgId: payload.newMsgId,
      timestamp: payload.timestamp,
      contentType: payload.contentType,
      raw: payload,
    };
  }

  // 苍何服务云 raw format: fields nested under data
  const data = payload.data ?? {};
  return {
    messageType,
    wcId,
    fromUser: data.fromUser,
    toUser: data.toUser,
    fromGroup: data.fromGroup,
    content: data.content ?? "",
    newMsgId: data.newMsgId,
    timestamp: data.timestamp ?? payload.timestamp,
    contentType: data.contentType,
    raw: payload,
  };
}

/** Map messageType code to a WechatMessageContext type */
function resolveMessageType(messageType: string): WechatMessageContext["type"] {
  switch (messageType) {
    case "60001": // private text
    case "80001": // group text
      return "text";
    case "60002": // private image
    case "80002": // group image
      return "image";
    case "60003": // private video
    case "80003": // group video
      return "video";
    case "60004": // private voice
    case "80004": // group voice
      return "voice";
    case "60008": // private file
    case "80008": // group file
      return "file";
    default:
      return "unknown";
  }
}

function isGroupMessage(messageType: string): boolean {
  return messageType.startsWith("8");
}

export function convertToMessageContext(payload: any): WechatMessageContext | null {
  const { messageType } = payload;

  // Offline notification
  if (messageType === "30000") {
    const wcId = payload.wcId;
    const offlineContent = payload.content ?? payload.data?.content;
    console.log(`Account ${wcId} is offline: ${offlineContent}`);
    return null;
  }

  // Only handle known private/group message types (6xxxx / 8xxxx)
  if (!messageType || (!messageType.startsWith("6") && !messageType.startsWith("8"))) {
    console.log(`Received unhandled message type ${messageType}`);
    return null;
  }

  const norm = normalizePayload(payload);

  if (!norm.fromUser) {
    console.log(`Message missing fromUser, skipping`);
    return null;
  }

  const msgType = resolveMessageType(messageType);
  const isGroup = isGroupMessage(messageType);

  const result: WechatMessageContext = {
    id: String(norm.newMsgId || Date.now()),
    type: msgType,
    sender: {
      id: norm.fromUser,
      name: norm.fromUser,
    },
    recipient: {
      id: norm.wcId,
    },
    content: norm.content,
    contentType: norm.contentType,
    timestamp: norm.timestamp || Date.now(),
    threadId: isGroup ? (norm.fromGroup || norm.fromUser) : norm.fromUser,
    raw: norm.raw,
  };

  if (isGroup && norm.fromGroup) {
    result.group = {
      id: norm.fromGroup,
      name: "",
    };
  }

  return result;
}
