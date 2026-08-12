import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { getWeChatRuntime } from "./runtime.js";
import { createWeChatReplyDispatcher } from "./reply-dispatcher.js";
import {
  buildInboundWeChatMediaContext,
  resolveInboundWeChatMedia,
} from "./inbound-media.js";
import type { WechatMessageContext, ResolvedWeChatAccount } from "./types.js";

// --- Message deduplication ---
const processedMessages = new Map<string, number>();
const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const DEDUP_MAX_SIZE = 1000;
const DEDUP_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let lastCleanup = Date.now();

function tryRecordMessage(messageId: string): boolean {
  const now = Date.now();

  // Periodic cleanup
  if (now - lastCleanup > DEDUP_CLEANUP_INTERVAL_MS) {
    lastCleanup = now;
    for (const [id, ts] of processedMessages) {
      if (now - ts > DEDUP_WINDOW_MS) processedMessages.delete(id);
    }
  }

  // Evict oldest if at capacity
  if (processedMessages.size >= DEDUP_MAX_SIZE) {
    const oldest = processedMessages.keys().next().value;
    if (oldest) processedMessages.delete(oldest);
  }

  if (processedMessages.has(messageId)) return false;
  processedMessages.set(messageId, now);
  return true;
}

export async function handleWeChatMessage(params: {
  cfg: ClawdbotConfig;
  message: WechatMessageContext;
  runtime?: RuntimeEnv;
  accountId?: string;
  account: ResolvedWeChatAccount;
}): Promise<void> {
  const { cfg, message, runtime, accountId, account } = params;

  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  // Dedup check
  if (!tryRecordMessage(message.id)) {
    log(`wechat: skipping duplicate message ${message.id}`);
    return;
  }

  const isGroup = !!message.group;

  log(`wechat[${accountId}]: received ${message.type} from ${message.sender.id}${isGroup ? ` in group ${message.group!.id}` : ""}`);

  const inboundMedia = resolveInboundWeChatMedia(message);

  if (message.type !== "text" && !inboundMedia) {
    log(`wechat[${accountId}]: ignoring unsupported message type or media reference: ${message.type}`);
    return;
  }

  try {
    const core = getWeChatRuntime();

    const wechatFrom = `wechat:${message.sender.id}`;
    const wechatTo = isGroup
      ? `group:${message.group!.id}`
      : `user:${message.sender.id}`;

    const peerId = isGroup ? message.group!.id : message.sender.id;

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "wechat",
      accountId: account.accountId,
      peer: {
        kind: isGroup ? "group" : "direct",
        id: peerId,
      },
    });

    const messageText = inboundMedia
      ? `[${inboundMedia.modality} attachment]`
      : message.content;
    const preview = messageText.replace(/\s+/g, " ").slice(0, 160);
    const inboundLabel = isGroup
      ? `WeChat[${accountId}] message in group ${message.group!.id}`
      : `WeChat[${accountId}] DM from ${message.sender.id}`;

    core.system.enqueueSystemEvent(`${inboundLabel}: ${preview}`, {
      sessionKey: route.sessionKey,
      contextKey: `wechat:message:${peerId}:${message.id}`,
    });

    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);

    // Build message body with speaker attribution
    const speaker = message.sender.name || message.sender.id;
    const messageBody = `${speaker}: ${messageText}`;

    const envelopeFrom = isGroup
      ? `${message.group!.id}:${message.sender.id}`
      : message.sender.id;

    const body = core.channel.reply.formatAgentEnvelope({
      channel: "WeChat",
      from: envelopeFrom,
      timestamp: new Date(message.timestamp),
      envelope: envelopeOptions,
      body: messageBody,
    });

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: body,
      RawBody: messageText,
      CommandBody: messageText,
      From: wechatFrom,
      To: wechatTo,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: isGroup ? "group" : "direct",
      GroupSubject: isGroup ? message.group!.id : undefined,
      SenderName: message.sender.name || message.sender.id,
      SenderId: message.sender.id,
      Provider: "wechat" as const,
      Surface: "wechat" as const,
      MessageSid: message.id,
      Timestamp: Date.now(),
      WasMentioned: false,
      CommandAuthorized: true,
      OriginatingChannel: "wechat" as const,
      OriginatingTo: wechatTo,
      ...buildInboundWeChatMediaContext(inboundMedia),
    });

    // Determine reply target: in groups reply to group, in DMs reply to sender
    const replyTo = isGroup ? message.group!.id : message.sender.id;

    const { dispatcher, replyOptions, markDispatchIdle } = createWeChatReplyDispatcher({
      cfg,
      agentId: route.agentId,
      runtime: runtime as RuntimeEnv,
      apiKey: account.apiKey,
      replyTo,
      accountId: account.accountId,
    });

    log(`wechat[${accountId}]: dispatching to agent (session=${route.sessionKey})`);

    const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions,
    });

    markDispatchIdle();

    log(`wechat[${accountId}]: dispatch complete (queuedFinal=${queuedFinal}, replies=${counts.final})`);
  } catch (err) {
    error(`wechat[${accountId}]: failed to dispatch message: ${String(err)}`);
  }
}
