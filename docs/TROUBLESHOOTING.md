# 排障手册

## 先拿诊断信息

菜单 **帮助 → 复制诊断信息**：会复制当前页 URL、UA、已注册插件列表、`Shockwave Flash` 是否在位、Flash MIME、页面里 `<embed>` / `.swf` 数量、Electron / Chromium 版本、Pepper Plugin 进程名。贴到 Issue 里即可。

菜单 **帮助 → Flash 自检页**：本地页面，直接看插件是否注册，以及 `test.swf` 播放区是否出图。

## 症状速查

| 症状 | 原因 / 处理 |
|---|---|
| 双击没反应 | 成品被 Gatekeeper 拦：右键 → 打开，或「系统设置 → 隐私与安全性」允许。也可能是只拷了快捷方式而不是整个 `.app` |
| 播放区显示「更新」占位 | OOD 补丁没生效。用 `python3 scripts/verify_patch.py <PepperFlashPlayer> --expect patched` 校验，按 BUILD.md 重打补丁 |
| 播放区一直转圈 | SWF 已启动、在等服务端数据（登录态 / AS3 兼容）。先确认已登录；这是服务端或 AS3 兼容性问题，浏览器端无解 |
| 提示「请安装 Flash」 | 插件检测 / 注入时序问题，看自检页里 MIME 是否注册；必要时清除登录状态并重启 |
| 播放区全黑 | 检查启动参数里是否混进了 `--disable-gpu`，删掉 |
| Helper 进程反复崩溃 | macOS 15 上老 Chromium 必须带 `--no-sandbox`（外壳已带） |
| 从终端手动跑报 `Cannot find module 'electron'` | 宿主注入了 `ELECTRON_RUN_AS_NODE=1`，用 `env -u ELECTRON_RUN_AS_NODE` 清掉 |
| 截图全黑看不出画面 | 别用系统 `screencapture`，用 `XXL_RENDER_PROBE=1` 走 `capturePage()` |
| 登录后游戏页空白 | 菜单「游戏 → 打开 QQ 空间首页」重新登录；或「设置 → 切换 Windows/Mac 浏览器标识」再试；备用入口在「游戏 → 打开完整分享链接」 |

## 诊断环境变量

从终端启动内嵌 Electron 时可加：

```bash
env -u ELECTRON_RUN_AS_NODE \
  "开心消消乐PC版.app/Contents/Resources/runtime/Electron.app/Contents/MacOS/Electron" \
  --no-sandbox --user-data-dir="$HOME/Library/Application Support/XXLFlashPC"
```

| 变量 | 作用 |
|---|---|
| `XXL_TEST_URL=<url>` | 启动就打开指定地址 |
| `XXL_SELFTEST=1` | 启动就打开 Flash 自检页 |
| `XXL_FLASH_VERSION=...` | 覆盖 `--ppapi-flash-version` |
| `XXL_EXTRA_SWITCHES=a,b=1` | 追加临时 Chromium 开关 |
| `XXL_RENDER_PROBE=1` | 5 秒后用 `capturePage()` 存图 |
| `XXL_CAPTURE_OUT=/tmp/x.png` | 配合上一项指定存图路径 |
| `XXL_DOM_DUMP=/tmp/dom.html` | 导出页面 outerHTML，判断占位是谁画的 |
| `XXL_CDP_DUMP=/tmp/cdp.html` | 用 CDP 穿透 shadow DOM 导出 |
| `XXL_CLICK=1` | 模拟点击 `<embed>` 中心，验证占位能否放行 |

## 日志

所有事件以 `[XXL]` 前缀打到 stdout，关键几行：

```
[XXL] plugin=... exists=true
[XXL] page-loaded url=... flash=true
[XXL] blocked update request: https://www.flash.cn/flashupdate?probe=1
```

`flash=false` 说明插件没被页面识别；有 `blocked update request` 说明禁更新链路在工作。

## 一个重要的判断边界

用**未登录**的裸请求去访问 QQ 空间游戏地址，看到 302 到 `xui.ptlogin2.qq.com` 只能说明「要登录」，**不能**据此判定游戏已下架。判断联网页游死活必须带登录态实测。

同理，本地 SWF 与联网 AS3 页游是两回事：本地 SWF 能跑，不代表需要服务端数据的页游能跑。
