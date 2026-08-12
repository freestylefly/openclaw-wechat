import type { ChannelPlugin, ClawdbotConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { ResolvedWeChatAccount, WechatConfig, WechatAccountConfig } from "./types.js";
import { ProxyClient } from "./proxy-client.js";
import { startCallbackServer } from "./callback-server.js";
import { handleWeChatMessage } from "./bot.js";
import { displayQRCode, displayLoginSuccess } from "./utils/qrcode.js";

// 代理服务地址（必须配置）
// openclaw config set channels.wechat.proxyUrl "http://your-proxy-server:3000"

const PLUGIN_META = {
  id: "wechat",
  label: "WeChat",
  selectionLabel: "WeChat (微信)",
  docsPath: "/channels/wechat",
  docsLabel: "wechat",
  blurb: "WeChat channel via Proxy API. 购买 API Key 请联系客服",
  order: 80,
} as const;

/**
 * 解析微信账号配置
 * 支持简化配置（顶级字段）和多账号配置（accounts）
 */
async function resolveWeChatAccount({
  cfg,
  accountId,
}: {
  cfg: ClawdbotConfig;
  accountId: string;
}): Promise<ResolvedWeChatAccount> {
  const wechatCfg = cfg.channels?.wechat as WechatConfig | undefined;
  const isDefault = accountId === DEFAULT_ACCOUNT_ID;

  let accountCfg: WechatAccountConfig | undefined;
  let enabled: boolean;

  if (isDefault) {
    // 简化配置：从顶级字段读取，合并默认账号配置
    const topLevelConfig: WechatAccountConfig = {
      apiKey: wechatCfg?.apiKey || "",
      proxyUrl: wechatCfg?.proxyUrl,
      deviceType: wechatCfg?.deviceType,
      proxy: wechatCfg?.proxy,
      webhookHost: wechatCfg?.webhookHost,
      webhookPort: wechatCfg?.webhookPort,
      webhookPath: wechatCfg?.webhookPath,
    };

    // 合并 accounts.default 配置（如果存在）
    const defaultAccount = wechatCfg?.accounts?.default;
    accountCfg = {
      ...topLevelConfig,
      ...defaultAccount,
      apiKey: topLevelConfig.apiKey || defaultAccount?.apiKey || "",
    };

    enabled = accountCfg.enabled ?? wechatCfg?.enabled ?? true;
  } else {
    accountCfg = wechatCfg?.accounts?.[accountId];
    enabled = accountCfg?.enabled ?? true;
  }

  if (!accountCfg?.apiKey) {
    throw new Error(
      `缺少 API Key。\n` +
        `请联系客服购买 API Key\n` +
        `然后配置: openclaw config set channels.wechat.apiKey "your-key"`
    );
  }

  if (!accountCfg?.proxyUrl) {
    throw new Error(
      `缺少 proxyUrl 配置。\n` +
        `请配置: openclaw config set channels.wechat.proxyUrl "http://your-proxy-server:3000"`
    );
  }

  return {
    accountId,
    enabled,
    configured: true,
    name: accountCfg.name,
    apiKey: accountCfg.apiKey,
    proxyUrl: accountCfg.proxyUrl,
    wcId: accountCfg.wcId,
    isLoggedIn: !!accountCfg.wcId,
    nickName: accountCfg.nickName,
    deviceType: accountCfg.deviceType || "ipad",
    proxy: accountCfg.proxy || "2",
    webhookHost: accountCfg.webhookHost,
    webhookPort: accountCfg.webhookPort || 18790,
    webhookPath: accountCfg.webhookPath || "/webhook/wechat",
    natappEnabled: accountCfg.natappEnabled ?? false,
    natapiWebPort: accountCfg.natapiWebPort || 4040,
    config: accountCfg,
  };
}

/**
 * 列出所有可用的微信账号 ID
 * 支持简化配置和多账号配置
 */
function listWeChatAccountIds(cfg: ClawdbotConfig): string[] {
  const wechatCfg = cfg.channels?.wechat as WechatConfig | undefined;

  // 如果有顶级 apiKey，则使用默认账号
  if (wechatCfg?.apiKey) {
    return [DEFAULT_ACCOUNT_ID];
  }

  // 否则从 accounts 中读取
  const accounts = wechatCfg?.accounts;
  if (!accounts) return [];

  return Object.keys(accounts).filter((id) => accounts[id]?.enabled !== false);
}

export const wechatPlugin: ChannelPlugin<ResolvedWeChatAccount> = {
  id: "wechat",

  meta: PLUGIN_META,

  capabilities: {
    chatTypes: ["direct", "channel"],
    polls: false,
    threads: false,
    media: true,
    reactions: false,
    edit: false,
    reply: false,
  },

  agentPrompt: {
    messageToolHints: () => [
      "- WeChat targeting: use `user:<wcId>` for direct messages, `group:<chatRoomId>` for groups.",
      "- WeChat supports text, image, video, and file messages.",
    ],
  },

  configSchema: {
    schema: {
      type: "object" as const,
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        // 简化配置（顶级字段）
        apiKey: { type: "string" },
        proxyUrl: { type: "string" },
        deviceType: { type: "string", enum: ["ipad", "mac"] },
        proxy: { type: "string" },
        webhookHost: { type: "string" },
        webhookPort: { type: "integer" },
        webhookPath: { type: "string" },
        // 多账号配置
        accounts: {
          type: "object" as const,
          additionalProperties: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              enabled: { type: "boolean" },
              name: { type: "string" },
              apiKey: { type: "string" },
              proxyUrl: { type: "string" },
              deviceType: { type: "string", enum: ["ipad", "mac"] },
              proxy: { type: "string" },
              webhookHost: { type: "string" },
              webhookPort: { type: "integer" },
              webhookPath: { type: "string" },
              natappEnabled: { type: "boolean" },
              natapiWebPort: { type: "integer" },
              wcId: { type: "string" },
              nickName: { type: "string" },
            },
            required: ["apiKey"],
          },
        },
      },
    },
  },

  config: {
    listAccountIds: (cfg) => listWeChatAccountIds(cfg),

    resolveAccount: (cfg, accountId) => resolveWeChatAccount({ cfg, accountId }),

    defaultAccountId: (cfg) => {
      const ids = listWeChatAccountIds(cfg);
      return ids[0] || DEFAULT_ACCOUNT_ID;
    },

    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const wechatCfg = cfg.channels?.wechat as WechatConfig | undefined;
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        // 对于默认账号，设置顶级 enabled
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            wechat: {
              ...wechatCfg,
              enabled,
            },
          },
        };
      }

      const account = wechatCfg?.accounts?.[accountId];
      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          wechat: {
            ...wechatCfg,
            accounts: {
              ...wechatCfg?.accounts,
              [accountId]: {
                ...account,
                enabled,
              },
            },
          },
        },
      };
    },

    deleteAccount: ({ cfg, accountId }) => {
      const wechatCfg = cfg.channels?.wechat as WechatConfig | undefined;
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        // 删除整个 wechat 配置
        const next = { ...cfg } as ClawdbotConfig;
        const nextChannels = { ...cfg.channels };
        delete (nextChannels as Record<string, unknown>).wechat;
        if (Object.keys(nextChannels).length > 0) {
          next.channels = nextChannels;
        } else {
          delete next.channels;
        }
        return next;
      }

      const accounts = { ...wechatCfg?.accounts };
      delete accounts[accountId];

      const nextCfg = { ...cfg } as ClawdbotConfig;
      nextCfg.channels = {
        ...cfg.channels,
        wechat: {
          ...wechatCfg,
          accounts: Object.keys(accounts).length > 0 ? accounts : undefined,
        },
      };

      return nextCfg;
    },

    isConfigured: () => {
      // Always return true - the actual config validation happens in resolveAccount
      return true;
    },

    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name || account.nickName || account.accountId,
      wcId: account.wcId,
      isLoggedIn: account.isLoggedIn,
    }),

    resolveAllowFrom: ({ cfg, accountId }) => {
      // WeChat doesn't use allowlist in this MVP
      return [];
    },

    formatAllowFrom: ({ allowFrom }) => allowFrom.map(String),
  },

  security: {
    collectWarnings: ({ cfg, accountId }) => {
      // No specific security warnings for MVP
      return [];
    },
  },

  setup: {
    resolveAccountId: () => DEFAULT_ACCOUNT_ID,

    applyAccountConfig: ({ cfg, accountId }) => {
      const wechatCfg = cfg.channels?.wechat as WechatConfig | undefined;
      const isDefault = !accountId || accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        // 对于默认账号，设置顶级 enabled
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            wechat: {
              ...wechatCfg,
              enabled: true,
            },
          },
        };
      }

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          wechat: {
            ...wechatCfg,
            accounts: {
              ...wechatCfg?.accounts,
              [accountId]: {
                ...wechatCfg?.accounts?.[accountId],
                enabled: true,
              },
            },
          },
        },
      };
    },
  },

  messaging: {
    normalizeTarget: (target) => {
      if (target.startsWith("user:")) {
        return { type: "direct", id: target.slice(5) };
      }
      if (target.startsWith("group:")) {
        return { type: "channel", id: target.slice(6) };
      }
      // Assume direct message if no prefix
      return { type: "direct", id: target };
    },

    targetResolver: {
      looksLikeId: (id) => {
        // wcId starts with wxid_ or is a chatroom ID
        return id.startsWith("wxid_") || id.includes("@chatroom");
      },
      hint: "<wxid_xxx|xxxx@chatroom|user:wxid_xxx|group:xxx@chatroom>",
    },
  },

  directory: {
    self: async () => null,

    listPeers: async ({ cfg, query, limit, accountId }) => {
      const account = await resolveWeChatAccount({ cfg, accountId });
      if (!account.isLoggedIn) return [];

      const client = new ProxyClient({
        apiKey: account.apiKey,
        accountId,
        baseUrl: account.proxyUrl,
      });
      const contacts = await client.getContacts(account.wcId!);

      return contacts.friends.slice(0, limit).map((id) => ({
        id,
        name: id,
        type: "user" as const,
      }));
    },

    listGroups: async ({ cfg, query, limit, accountId }) => {
      const account = await resolveWeChatAccount({ cfg, accountId });
      if (!account.isLoggedIn) return [];

      const client = new ProxyClient({
        apiKey: account.apiKey,
        accountId,
        baseUrl: account.proxyUrl,
      });
      const contacts = await client.getContacts(account.wcId!);

      return contacts.chatrooms.slice(0, limit).map((id) => ({
        id,
        name: id,
        type: "group" as const,
      }));
    },
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      port: null,
    },

    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      port: snapshot.port ?? null,
    }),

    probeAccount: async ({ cfg, accountId }) => {
      const account = await resolveWeChatAccount({ cfg, accountId });
      const client = new ProxyClient({
        apiKey: account.apiKey,
        accountId,
        baseUrl: account.proxyUrl,
      });

      try {
        const status = await client.getStatus();
        return {
          ok: status.valid && status.isLoggedIn,
          error: status.error,
          wcId: status.wcId,
          nickName: status.nickName,
        };
      } catch (err: any) {
        return {
          ok: false,
          error: err.message,
        };
      }
    },

    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name || account.nickName,
      wcId: account.wcId,
      isLoggedIn: account.isLoggedIn,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      port: runtime?.port ?? null,
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      const { cfg, accountId, abortSignal, setStatus, log } = ctx;
      const account = await resolveWeChatAccount({ cfg, accountId });

      log?.info(`Starting WeChat account: ${accountId}`);
      log?.info(`Proxy URL: ${account.proxyUrl}`);

      const client = new ProxyClient({
        apiKey: account.apiKey,
        accountId,
        baseUrl: account.proxyUrl,
      });

      // Check current status
      const status = await client.getStatus();

      if (!status.valid) {
        throw new Error(`API Key invalid: ${status.error || "Unknown error"}`);
      }

      // If not logged in, perform QR code login
      if (!status.isLoggedIn) {
        log?.info("Not logged in, starting QR code login flow");

        const { qrCodeUrl, wId } = await client.getQRCode(
          account.deviceType,
          account.proxy
        );

        await displayQRCode(qrCodeUrl);

        // Poll for login status
        let loggedIn = false;
        let loginResult: { wcId: string; nickName: string; headUrl?: string } | null = null;

        for (let i = 0; i < 60; i++) {
          if (abortSignal?.aborted) {
            throw new Error("Login aborted");
          }

          await new Promise((r) => setTimeout(r, 5000));

          const check = await client.checkLogin(wId);

          if (check.status === "logged_in") {
            loggedIn = true;
            loginResult = check;
            break;
          } else if (check.status === "need_verify") {
            log?.warn(`Verification required: ${check.verifyUrl}`);
            console.log(`\n⚠️  需要辅助验证，请访问: ${check.verifyUrl}\n`);
          }
        }

        if (!loggedIn || !loginResult) {
          throw new Error("Login timeout: QR code expired");
        }

        displayLoginSuccess(loginResult.nickName, loginResult.wcId);

        // Note: In real implementation, you'd need to save this config
        log?.info(`Login successful: ${loginResult.nickName} (${loginResult.wcId})`);

        // Update local account object
        account.wcId = loginResult.wcId;
        account.nickName = loginResult.nickName;
        account.isLoggedIn = true;
      } else {
        log?.info(`Already logged in: ${status.nickName} (${status.wcId})`);
        account.wcId = status.wcId;
        account.nickName = status.nickName;
        account.isLoggedIn = true;
      }

      // Start webhook server to receive messages
      const port = account.webhookPort;
      setStatus({ accountId, port, running: true });

      // Determine webhook URL for Proxy to forward messages
      let webhookHost: string;

      if (account.webhookHost) {
        // 用户配置了公网地址
        webhookHost = account.webhookHost;
      } else {
        // 自动检测本机 IP（适用于云服务器）
        const { networkInterfaces } = await import("os");
        const nets = networkInterfaces();
        let localIp = "localhost";
        for (const name of Object.keys(nets)) {
          for (const net of nets[name] || []) {
            if (net.family === "IPv4" && !net.internal) {
              localIp = net.address;
              break;
            }
          }
          if (localIp !== "localhost") break;
        }
        webhookHost = localIp;
        log?.warn(`webhookHost 未配置，使用自动检测的 IP: ${localIp}`);
        log?.warn(`建议配置: openclaw config set channels.wechat.webhookHost "your-public-ip"`);
      }

      const webhookUrl = `http://${webhookHost}:${port}${account.webhookPath}`;
      log?.info(`Using webhook URL: ${webhookUrl}`);

      // Register webhook with proxy service
      log?.info(`Registering webhook with proxy service for wcId: ${account.wcId}`);
      await client.registerWebhook(account.wcId!, webhookUrl);

      const { stop } = await startCallbackServer({
        port,
        apiKey: account.apiKey,
        onMessage: (message) => {
          handleWeChatMessage({
            cfg,
            message,
            runtime: ctx.runtime,
            accountId,
            account,
          }).catch((err) => {
            log?.error(`Failed to handle WeChat message: ${String(err)}`);
          });
        },
        abortSignal,
      });

      abortSignal?.addEventListener("abort", stop);

      log?.info(`WeChat account ${accountId} started successfully on port ${port}`);
      log?.info(`Webhook URL: ${webhookUrl}`);

      // Return a cleanup function
      return {
        async stop() {
          stop();
          setStatus({ accountId, port, running: false });
        },
      };
    },
  },

  outbound: {
    async sendText({ cfg, to, text, accountId }) {
      const account = await resolveWeChatAccount({ cfg, accountId });
      const client = new ProxyClient({
        apiKey: account.apiKey,
        accountId,
        baseUrl: account.proxyUrl,
      });

      if (!account.wcId) {
        throw new Error("Not logged in");
      }

      const result = await client.sendText(to.id, text);

      return {
        channel: "wechat",
        messageId: String(result.newMsgId),
        timestamp: result.createTime,
      };
    },

    async sendMedia({ cfg, to, mediaUrl, text, accountId }) {
      const account = await resolveWeChatAccount({ cfg, accountId });
      const client = new ProxyClient({
        apiKey: account.apiKey,
        accountId,
        baseUrl: account.proxyUrl,
      });

      if (!account.wcId) {
        throw new Error("Not logged in");
      }

      // Send text first if provided
      if (text?.trim()) {
        await client.sendText(to.id, text);
      }

      // Send image
      const result = await client.sendImage(to.id, mediaUrl);

      return {
        channel: "wechat",
        messageId: String(result.newMsgId),
      };
    },
  },
};
