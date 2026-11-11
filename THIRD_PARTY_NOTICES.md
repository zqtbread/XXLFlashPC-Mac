# 第三方组件与版权声明

本仓库的**源码**不含下列任何二进制；它们出现在 Release 的预编译 `.app` 附件中，或需使用者按 [docs/BUILD.md](docs/BUILD.md) 自行准备。

| 组件 | 版本 | 用途 | 权利归属 / 许可 |
|---|---|---|---|
| Electron | 11.5.0 (darwin-x64) | 应用外壳与浏览器内核 | © Electron 贡献者，MIT；随附 `LICENSE` |
| Chromium | 87.0.4280.141 | 渲染引擎，最后一个支持 PPAPI Flash 的分支 | © Chromium 贡献者，BSD 等；随附 `LICENSES.chromium.html` |
| Adobe Flash Player (PPAPI, macOS) | 34.0.0.372 | Swift/AS3 运行时 | © Adobe（中国大陆版本由重橙网络 / Flash Center 发行），专有许可，**已停止支持** |
| FlashPatch | — | 去除 OOD / Flash Center 强制更新锁 | © darktohka，参见 [上游仓库](https://github.com/darktohka/FlashPatch) 的许可条款 |
| CefFlashBrowser | — | Windows 原版，仅参考其 Flash 启动参数与偏好设置 | © Mzying2001，参见 [上游仓库](https://github.com/Mzying2001/CefFlashBrowser) 的许可条款 |
| Ruffle | 0.8.0-nightly | 早期探索路线，未包含在最终成品中 | © Ruffle 贡献者，MIT / Apache-2.0 |

## 商标

「QQ 空间」「QQ」为腾讯相关商标，「开心消消乐」为乐元素相关商标，Adobe / Flash 为 Adobe 相关商标。本仓库仅作事实性引用，用于说明兼容性目标，不表示任何授权、关联或背书。

## 关于 Flash Player 二进制

Flash Player 于 2020 年底停止支持，中国特供版自 2022 年 1 月起附带 OOD / Flash Center 强制更新锁。本工程的 Release 附件中，该插件二进制被修改了 7 处共 20 字节以恢复本地播放能力，并做了 ad-hoc 重签。该修改仅用于个人在自己的设备上运行已合法取得的旧版内容。

仓库**不提供** Flash 插件的原始下载，构建脚本也**不会**自动下载它。

权利人如认为上述内容不妥，请在本仓库开 Issue 联系仓库所有者，相关附件将被立即下架。

## 联系

仓库所有者：zqtbread（GitHub）。下架请求优先通过 Issue 提交。
