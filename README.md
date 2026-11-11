# XXLFlashPC-Mac

在 macOS 上**原生**打开 QQ 空间 PC 版开心消消乐（`appid 100718846`）的自包含浏览器壳。

> **中文说明入口**：[使用说明.md](使用说明.md)（完整使用步骤）｜[随成品附带的 txt](docs/使用说明.txt)｜[排障手册](docs/TROUBLESHOOTING.md)｜[构建指南](docs/BUILD.md)。本仓库所有文档均为中文，这份 README 也是中文。Release 里的 `XXLFlashPC-Mac-README-zh.txt` 就是可单独下载的中文说明。

不是 Ruffle 模拟，不是云游戏，不是手游 / H5 版，不是 QQ 游戏大厅，也不是远程桌面或虚拟机：它内置真正的 Adobe Flash PPAPI 播放器与最后一个支持它的 Chromium 内核，双击即用，登录态和全部依赖都装在 `.app` 里，拷到另一台 Intel Mac 也能直接用。

> 本项目是个人兼容性与可移植性研究，供自用与技术参考。第三方二进制的版权归属、使用限制与下架联系方式见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

---

## 一、快速开始

1. 到 **Releases → v1.0.0** 下载 `XXLFlashPC-Mac-v1.0.0.zip`（约 85 MB）。
2. 用 macOS 自带的「归档实用工具」解压（双击 zip 即可），得到 `开心消消乐PC版.app`。
   （Release 附件用 ASCII 文件名，是因为 GitHub 会清洗中文附件名；解压出来的 `.app` 仍是中文名。）
3. 双击打开。首次会进入 QQ 官方登录页，用 QQ 号密码或手机 QQ 扫码登录。
4. 菜单 **游戏 → 打开 QQ 空间游戏**，或直接等登录回跳。登录态保存在 `~/Library/Application Support/XXLFlashPC`，以后双击直接玩。

完整中文步骤见 [使用说明.md](使用说明.md)；随成品附带的纯文本版在 [docs/使用说明.txt](docs/使用说明.txt)。

**如果游戏区域没出画面**：先点一下播放区中间的方块；仍不行就用菜单 **帮助 → 复制诊断信息**，把内容贴到 Issue 里。排障手册见 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)。

---

## 二、已验证 / 未验证

| 项目 | 状态 |
|---|---|
| macOS 15.8.3 / Intel x86_64 上注册 `Shockwave Flash 34.0 r0` | ✅ 实测通过 |
| Flash 内容真实渲染（非模拟、非占位） | ✅ 实测通过（测试 SWF 橙黄底色出图） |
| 「一加载完就弹更新」占位消失 | ✅ 实测通过 |
| 更新域名请求被拦截、启动时自动写 `mms.cfg` | ✅ 实测通过 |
| 游戏地址 → QQ 官方登录页、二维码 / 快捷登录拉起、回跳 `game.qzone.qq.com/100718846` | ✅ 实测通过 |
| 成品自包含、ad-hoc 签名有效、双击即开、独立 profile | ✅ 实测通过 |
| **扫码登录之后游戏页的实际表现** | ⚠️ 需要本人账号，作者无法代验 |

环境要求：**Intel（x86_64）Mac**。插件是 Mach-O x86_64，Apple Silicon 未经测试（Rosetta 2 下不保证）。

---

## 三、为什么是这套方案

### 1. Ruffle 不行

最早用 Swift / WKWebView + 内置 Ruffle WASM 重写过一版，本地 SWF、AS1/AS2 老游戏能跑，但 QQ 空间这个游戏是需要登录态、要跟服务端通信的 AS3 页游：页面停在 Ruffle 的加载圈，实际是 SWF 已经启动、在等服务端数据，浏览器端补不上。所以必须换成真 Flash。

### 2. macOS 并没有「封死」PPAPI Flash

常见误解是系统层禁了 Flash。实测并非如此：被禁的是 **Chrome 88+ 移除了 Flash 支持**，而 Chromium 87 及更早版本仍能正常注册 PPAPI 插件、拉起 `Pepper Plugin: Shockwave Flash` 进程。因此选 **Electron 11.5.0 / Chromium 87.0.4280.141**（最后一个支持 PPAPI Flash 的分支）+ Mac 版 `PepperFlashPlayer.plugin`。

启动参数沿用 Windows 原版 `CefFlashBrowser.InitCefFlash()` 中已实机验证的那套：

```
ppapi-flash-path / ppapi-flash-version / enable-system-flash=1 /
autoplay-policy=no-user-gesture-required /
override-plugin-power-saver-for-testing=never /
allow-outdated-plugins / no-sandbox
```

`webPreferences.plugins: true` 与 `profile.default_content_setting_values.plugins = 1` 同等关键，缺了会出现「插件已注册但 `<embed>` 不加载」。

### 3. 真正的拦路虎：中国特供版 Flash 的「强制更新」锁

点击播放区的「更新」会跳 `https://www.flash.cn/flashupdate → /download-wins → /download`；插件二进制里写着 `Starting from January 10, 2022 ... you have to upgrade to Flash Center`。这是中国特供版 Flash 34 的 OOD（out-of-date）/ Flash Center 锁：

- `mms.cfg` 全套键（含 `OverrideXCLicenseCheck`、`EnableInsecureOutOfDatePlayer`、`uci*`）——**无效**
- 伪装 `--ppapi-flash-version`、断网、`--disable-component-update`、预写 Preferences、换 Electron 10/9/8/7/6、换 34.0.0.330 旧插件——**全部无效**
- 换 CEF 84 macOS 版 `cefclient.app`：插件能注册但 SWF 都不请求（缺原版运行时的 `SetPreference`）

结论：只能从插件二进制本身破。用 [FlashPatch](https://github.com/darktohka/FlashPatch) 的 OOD 补丁，停用 `oodAlert` 的父函数、条件跳转改无条件跳转，**共改 7 处 20 字节**，再 ad-hoc 重签。补丁后占位消失，Flash 正常出图。完整字节清单见 [scripts/verify_patch.py](scripts/verify_patch.py)。

---

## 四、三层禁更新

「必须禁止更新，否则一加载完立刻弹更新」是硬性要求，所以做了三层冗余，且全部内置在 `.app` 里，拷走也生效：

| 层 | 做法 |
|---|---|
| ① 二进制 | 插件 Mach-O 打 OOD 补丁，`codesign --force --deep --sign -` 重签 |
| ② 配置 | `app.on('ready')` 每次启动自动写 3 处 `~/Library/Application Support/Macromedia/mms.cfg`（含 `AutoUpdateDisable=1`、`SilentAutoUpdateEnable=0`、`uciOODBlockingDays=0` 等） |
| ③ 网络/UI | `session.webRequest.onBeforeRequest` 取消 `flash.cn`、`adobefpl.com`、`geo2.adobe.com`、`ood.xml`、`fppings`、`flashupdate` 等请求；`new-window` / `will-navigate` 拦掉跳转 |

实测日志：`[XXL] blocked update request: https://www.flash.cn/flashupdate?probe=1`。

---

## 五、仓库结构

本仓库**只放自研源码与文档**，不含任何 Electron / Chromium / Flash 二进制（成品在 Release 附件里）。

```
XXLFlashPC-Mac/
├── 使用说明.md              # 给使用者的完整中文说明
├── app/                     # Electron 主程序
│   ├── main.js              # 窗口、菜单、插件参数、禁更新三层、诊断
│   ├── package.json
│   ├── selftest.html        # Flash 自检页
│   └── test.swf             # 30 字节测试 SWF（橙黄底色，用于确认真出图）
├── launcher.applescript     # 外层双击启动器（独立 profile）
├── scripts/
│   ├── build.sh             # 从源码组装 .app 并打包 zip
│   └── verify_patch.py      # 校验 OOD 补丁 20 字节
├── docs/
│   ├── 使用说明.txt         # 交付给使用者的完整说明
│   ├── BUILD.md             # 从零构建、参数来源、踩坑记录
│   └── TROUBLESHOOTING.md   # 诊断与常见问题
├── LICENSE                  # 仅覆盖本仓库原创代码（MIT）
└── THIRD_PARTY_NOTICES.md   # 第三方组件版权声明
```

从源码构建需要自备 Mac 版 PPAPI Flash 插件（本仓库不提供、不分发源码形式的二进制），详见 [docs/BUILD.md](docs/BUILD.md)。

### 网络受限时同步代码

若 `git push` 报 `CONNECT tunnel failed` / 502（`github.com` 被代理拦，但 `api.github.com` 可用），可以走 API 同步：

```bash
python3 scripts/sync_via_api.py
```

原理：按本地 git 索引重建完整 tree 与 commit，复刻 author / committer / message，使远端 commit 的 SHA 与本地 HEAD **完全一致**，之后本地仓库依旧干净、可继续提交。需要已安装并登录 `gh`、改动已 commit。也可用 `GITHUB_REPO=owner/repo` 覆盖目标仓库。

---

## 六、安全提醒

- 内核是 **2020 年的 Chromium 87 + 已停止支持的 Flash**，仅为兼容这一款老游戏而保留。**只用它打开这个游戏**，不要拿它上网银、邮箱，或输入其他重要账号密码。
- QQ 登录走的是 `ptlogin2.qq.com` 官方页；本程序不读取、不上传账号密码，登录态只存在本机独立 profile 里。
- 成品是 ad-hoc 签名，首次打开若被 Gatekeeper 拦，右键 → 打开，或在「系统设置 → 隐私与安全性」里允许。
- 早期 Swift / Ruffle 版（`CefFlashBrowser-mac`）与本方案是两条独立路线，本仓库不包含其源码。

---

## 七、法律与版权

- 本仓库源码为原创，按 MIT 许可发布；**MIT 不覆盖任何第三方二进制或 Release 附件**。
- Adobe Flash Player、Electron / Chromium、QQ 空间与「开心消消乐」相关名称与商标，权利归各自所有者。Flash Player 已停止支持，其再分发受原许可约束。
- Release 中的成品包含为恢复本地兼容性而修改的 Flash 插件二进制，仅供个人在已合法取得该插件的前提下研究使用。权利人如认为不妥，请开 Issue 或联系仓库所有者，将立即下架相关附件。
- 本项目与 Adobe、腾讯、乐元素、上列上游项目均无关联，也未获其授权或背书。

---

## 八、致谢

- [Mzying2001/CefFlashBrowser](https://github.com/Mzying2001/CefFlashBrowser) —— Windows 原版，启动参数与偏好设置的来源
- [darktohka/FlashPatch](https://github.com/darktohka/FlashPatch) —— OOD 补丁方案
- [Electron](https://www.electronjs.org/) / [Chromium](https://www.chromium.org/) —— 内核
- [Ruffle](https://ruffle.rs/) —— 早期方案，虽不适用于本游戏，但验证了本地 SWF 路径
