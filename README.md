# openclaw-wechat

WeChat (微信) channel plugin for [OpenClaw](https://github.com/openclaw/openclaw).

[English](#english) | [中文](#中文)

---

## English

### Installation

```bash
openclaw plugins install @canghe/openclaw-wechat
```

### Upgrade

```bash
openclaw plugins update wechat
```

### Configuration

1. Purchase an API Key from customer service
2. Configure the plugin:

```bash
# Set API Key (required)
openclaw config set channels.wechat.apiKey "wc_live_xxxxxxxxxxxxxxxx"

# Set proxy URL (required)
openclaw config set channels.wechat.proxyUrl "http://your-proxy-server:3000"

# Set webhook host (required for cloud deployment)
openclaw config set channels.wechat.webhookHost "your-server-ip"

# Enable the channel
openclaw config set channels.wechat.enabled true
```

### Configuration Options

```yaml
# ~/.openclaw/openclaw.json
channels:
  wechat:
    enabled: true
    apiKey: "wc_live_xxxxxxxxxxxxxxxx"    # Required
    proxyUrl: "http://your-proxy:3000"    # Required - Proxy service URL

    # Webhook configuration (required for cloud deployment)
    webhookHost: "1.2.3.4"                # Your server public IP or domain
    webhookPort: 18790                    # Default: 18790
    webhookPath: "/webhook/wechat"        # Default: /webhook/wechat

    # Optional settings
    deviceType: "mac"                     # "ipad" or "mac", default: "ipad"
```

### First-time Login

When you start the gateway for the first time, a QR code will be displayed. Scan it with WeChat to log in.

```bash
openclaw gateway start
```

### Features

- Direct messages and group chats
- Text and image messages
- QR code login flow
- Multi-account support

### FAQ

#### Bot cannot receive messages

1. Make sure `webhookHost` is configured with your server's public IP
2. Make sure `webhookPort` is accessible from the internet
3. Check if the gateway is running: `openclaw gateway status`

#### How to use multiple accounts

```yaml
channels:
  wechat:
    accounts:
      work:
        apiKey: "wc_live_work_xxx"
        webhookHost: "1.2.3.4"
      personal:
        apiKey: "wc_live_personal_xxx"
        webhookHost: "1.2.3.4"
```

---

## 中文

### 安装

```bash
openclaw plugins install @canghe/openclaw-wechat
```

### 升级

```bash
openclaw plugins update wechat
```

### 配置

1. 联系客服购买 API Key
2. 配置插件：

```bash
# 设置 API Key（必填）
openclaw config set channels.wechat.apiKey "wc_live_xxxxxxxxxxxxxxxx"

# 设置代理服务地址（必填）
openclaw config set channels.wechat.proxyUrl "http://你的代理服务器:3000"

# 设置 webhook 公网地址（云服务器部署必填）
openclaw config set channels.wechat.webhookHost "你的服务器IP"

# 启用通道
openclaw config set channels.wechat.enabled true
```

### 配置选项

```yaml
# ~/.openclaw/openclaw.json
channels:
  wechat:
    enabled: true
    apiKey: "wc_live_xxxxxxxxxxxxxxxx"    # 必填
    proxyUrl: "http://你的代理:3000"      # 必填 - 代理服务地址

    # Webhook 配置（云服务器部署必填）
    webhookHost: "1.2.3.4"                # 服务器公网 IP 或域名
    webhookPort: 18790                    # 默认: 18790
    webhookPath: "/webhook/wechat"        # 默认: /webhook/wechat

    # 可选配置
    deviceType: "mac"                     # "ipad" 或 "mac"，默认: "ipad"
```

### 首次登录

首次启动 gateway 时会显示二维码，用微信扫码登录。

```bash
openclaw gateway start
```

### 功能

- 私聊和群聊
- 文本和图片消息
- 二维码登录流程
- 多账号支持

### 常见问题

#### 机器人收不到消息

1. 确保 `webhookHost` 配置了服务器的公网 IP
2. 确保 `webhookPort` 端口可从外网访问
3. 检查 gateway 是否运行：`openclaw gateway status`

#### 如何使用多账号

```yaml
channels:
  wechat:
    accounts:
      work:
        apiKey: "wc_live_work_xxx"
        webhookHost: "1.2.3.4"
      personal:
        apiKey: "wc_live_personal_xxx"
        webhookHost: "1.2.3.4"
```

---

## 申明

本插件仅供学习和研究使用，请勿用于非法用途，否则后果自负。

## 交流群

关于 bot 进群交流请扫码关注，并回复：openclaw-wechat

![](./images/%E7%BE%A4%E8%81%8A%E4%BA%A4%E6%B5%81.bmp)



## 十一、star 趋势图

[![Star History Chart](https://api.star-history.com/svg?repos=freestylefly/openclaw-wechat&type=Date)](https://star-history.com/#freestylefly/openclaw-wechat&Date)

## License

MIT
