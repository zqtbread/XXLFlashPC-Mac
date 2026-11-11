# 从零构建

只想用的话不必看这篇，直接下 Release 附件。这篇给需要在另一台 Intel Mac 上重新组装、或想复现/改参数的人。

## 1. 前提

| 项目 | 要求 |
|---|---|
| 机器 | Intel (x86_64) Mac；实测 macOS 15.8.3 |
| 工具 | Xcode 命令行工具（`osacompile`、`codesign`）、Python 3、`curl`、`ditto` |
| Electron | 11.5.0 / Chromium 87.0.4280.141，脚本自动下载 |
| Flash 插件 | macOS 版 `flash.plugin` 34.0.0.372 (PPAPI, Mach-O x86_64) —— **需自行合法取得** |
| OOD 补丁 | FlashPatch（Rust / cargo），或已打补丁的可执行文件 |

## 2. 准备第三方文件

```
XXLFlashPC-Mac/
└── vendor/
    ├── flash.plugin/                    # 完整插件 bundle
    └── PepperFlashPlayer.patched       # 可选：已打补丁的 Mach-O，脚本会自动替换
```

`vendor/` 已在 `.gitignore` 里，不会被提交。

### 打 OOD 补丁

```bash
git clone https://github.com/darktohka/FlashPatch /tmp/FlashPatch
cd /tmp/FlashPatch && cargo build --release
./target/release/flashpatch \
  vendor/flash.plugin/Contents/MacOS/PepperFlashPlayer \
  vendor/PepperFlashPlayer.patched

python3 scripts/verify_patch.py vendor/PepperFlashPlayer.patched --expect patched
```

补丁落在 7 处共 20 字节（完整清单见 `scripts/verify_patch.py`）。替换回 bundle 后必须重新 ad-hoc 签名，`build.sh` 会在组装阶段统一做。

> **本机编译 FlashPatch 的一个坑**：Homebrew 的 rustc 1.96 在这一代 macOS 上启动即 SIGABRT，报找不到 `/usr/local/Cellar/z3/5.1.0/lib/libz3.4.16.dylib`。在 z3 的 lib 目录加一条软链即可，不要删文件：
> ```bash
> ln -s libz3.5.1.dylib /usr/local/Cellar/z3/5.1.0/lib/libz3.4.16.dylib
> ```

## 3. 构建

```bash
chmod +x scripts/build.sh
./scripts/build.sh
```

产出：

```
build/开心消消乐PC版.app
build/开心消消乐PC版-Mac.zip
```

结构：

```
开心消消乐PC版.app/                       # AppleScript 外壳，双击入口
└── Contents/
    ├── MacOS/applet
    └── Resources/
        ├── Scripts/main.scpt
        └── runtime/Electron.app/         # 自包含内核
            └── Contents/Resources/
                ├── app/                  # 本仓库 app/ 源码
                └── flash.plugin/         # 已打补丁、已重签
```

外层启动器用 `open -a ... --args --no-sandbox --user-data-dir=~/Library/Application Support/XXLFlashPC` 拉起内核，登录态存在独立 profile 里，不碰用户其他 Chromium 数据。

## 4. 参数为什么是这些

来自 Windows 原版 `CefFlashBrowser.InitCefFlash()`，已实机验证：

```js
app.commandLine.appendSwitch('ppapi-flash-path', PLUGIN);
app.commandLine.appendSwitch('ppapi-flash-version', '34.0.0.372');
app.commandLine.appendSwitch('enable-system-flash', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('override-plugin-power-saver-for-testing', 'never');
app.commandLine.appendSwitch('allow-outdated-plugins');
app.commandLine.appendSwitch('no-sandbox');   // macOS 15 上老 Chromium Helper 必加
```

`BrowserWindow` 的 `webPreferences.plugins: true` 等价于原版 `SetPreference("profile.default_content_setting_values.plugins", 1)`，缺了会出现「插件注册成功、但 `<embed>` 根本不发起 SWF 请求」。

`--disable-gpu` **不要加**，曾导致播放区黑屏。

## 5. 已经走过、不用再走的弯路

这些全部实测无效，别重复：

- `mms.cfg` 全套键（含 `OverrideXCLicenseCheck`、`EnableInsecureOutOfDatePlayer`、`uciServerOODXMLFlag`、`uciOODBlockingDays`）
- `--ppapi-flash-version` 伪装成 99.0.0.999
- 换 Electron 10/9/8（Chromium 85/83/80）；Electron 7/6 在 macOS 15 起不来
- 断网 `--host-resolver-rules=MAP * 0.0.0.0`、`--disable-component-update`、预写 Preferences、各种授权开关
- 换 34.0.0.330 旧插件
- CEF 84 macOS 预编译 `cefclient.app`：插件能注册但连 SWF 都不请求

唯一有效的是给插件二进制打 OOD 补丁，再叠 `mms.cfg` + 请求/弹窗拦截做冗余。

## 6. 判据教训

早期用自造 SWF 里的 ActionScript（`getURL` 发 `/SWF_EXECUTED`）判断「AS 有没有执行」，而那段字节码从未验证过正确性，得出过「AS 未执行」的**假阴性**，误导了好几轮方向。

判定 Flash 是否真的出图，看 `webContents.capturePage()` 截图的**渲染颜色**（`test.swf` 设了 `#FFC850` 橙黄底色），比自造 AS 请求可靠。`screencapture` 在这台机器上抓窗口内容是全黑的，必须用 Electron 的 `capturePage()`。

回归测试要**串行**：并行开多个 GUI 实例会被 App Nap 节流，造成假失败。本地测试服务器记得发 `Cache-Control: no-store`。

## 7. 宿主环境注意

WorkBuddy 之类宿主可能给子进程注入 `ELECTRON_RUN_AS_NODE=1`，这会让任何 Electron app 退化成纯 Node 并报 `Cannot find module 'electron'`。从终端手动测试时先清掉：

```bash
env -u ELECTRON_RUN_AS_NODE open -a "path/to/Electron.app" --args ...
```

成品外壳通过 `open -a` 启动，不受此影响。
