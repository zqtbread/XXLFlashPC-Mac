'use strict';

// 开心消消乐 · QQ空间 PC版 专用浏览器
// Electron 11.5.0 (Chromium 87) + 内置真 Adobe Flash PPAPI 34.0.0.372
// 所有路径都相对 app bundle，整个 .app 拷到任何地方都能用。

const { app, BrowserWindow, Menu, session, clipboard, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');

const PLUGIN = path.resolve(__dirname, '..', 'flash.plugin');
const SELFTEST = path.join(__dirname, 'selftest.html');

const HOME_URL = 'https://game.qzone.qq.com/100718846';
const SHARE_URL = 'http://my.qzone.qq.com/app/100718846.html?detail=2560586830&app_custom=gip_src%3D10013%26fromId%3D76012949740262&via=qz.appassit.storyfeed&qz_version=8';
const LOGIN_URL = 'https://qzone.qq.com/';

const UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36';
const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36';

// 必须在 app ready 之前
// 版本号可由环境变量覆盖（诊断用）；默认与内置插件 manifest 一致
const FLASH_VERSION = process.env.XXL_FLASH_VERSION || '34.0.0.372';
app.commandLine.appendSwitch('ppapi-flash-path', PLUGIN);
app.commandLine.appendSwitch('ppapi-flash-version', FLASH_VERSION);
app.commandLine.appendSwitch('enable-plugins');
app.commandLine.appendSwitch('allow-outdated-plugins');
// 以下三项来自 Windows 原版 CefFlashBrowser 的 InitCefFlash()，已实机验证
app.commandLine.appendSwitch('enable-system-flash', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('override-plugin-power-saver-for-testing', 'never');
app.commandLine.appendSwitch('allow-running-insecure-content');
app.commandLine.appendSwitch('no-sandbox');

// 诊断用：XXL_EXTRA_SWITCHES='disable-component-update,no-first-run=1'
if (process.env.XXL_EXTRA_SWITCHES) {
  process.env.XXL_EXTRA_SWITCHES.split(',').forEach(function (s) {
    if (!s) return;
    const eq = s.indexOf('=');
    if (eq > 0) app.commandLine.appendSwitch(s.slice(0, eq), s.slice(eq + 1));
    else app.commandLine.appendSwitch(s);
  });
}

const PARTITION = 'persist:xxlflash';
let currentUA = UA_WIN;
const windows = [];

// ============================================================
// 禁止 Flash 自动更新（用户明确要求）
// 内置插件已在二进制层打过 OOD 补丁，破掉中国版「必须升级 Flash Center」
// 那条锁；下面再加三层保险：配置文件、网络请求、弹窗/跳转。
// ============================================================
const MMS_CFG = [
  'AutoUpdateDisable=1',
  'SilentAutoUpdateEnable=0',
  'AutoUpdateEnableForInternalSAU=0',
  'AutoUpdateEnableForPreRelease=0',
  'AutoUpdateInterval=0',
  'AutoUpdateVersionUrl=',
  'DisableCheckForUpdatesMenuItem=1',
  'DisableProductDownload=1',
  'EnableInsecureOutOfDatePlayer=1',
  'OverrideXCLicenseCheck=1',
  'uciServerOODXMLFlag=0',
  'uciOODBlockingDays=0',
  'uciOODWarningDays=0',
  'uciOODAlert=0',
  'uciOODAlertFC=0',
  'uciOODUrl='
].join('\n') + '\n';

let blockedUpdates = 0;
const UPDATE_ENDPOINT = /(flashupdate|fpupdate|ood\.xml|fppings|flashplayer\/update|check_for_flash_player_updates|about_flash_player)/i;
const UPDATE_HOST = /(^|\.)(flash\.cn|adobefpl\.com|geo2\.adobe\.com|fpdownload2?\.macromedia\.com|fpdownload\.adobe\.com|4i0gieyogl\.execute-api\.us-east-1\.amazonaws\.com)$/i;

function isUpdateUrl(raw) {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    // flash.cn 整站都是 Flash Center 更新/推广页，一律拦；其余只拦更新端点
    if (/^(www\.)?flash\.cn$/i.test(host)) return true;
    return UPDATE_HOST.test(host) && UPDATE_ENDPOINT.test(u.pathname);
  } catch (e) { return false; }
}

function installNoUpdateConfig() {
  const home = app.getPath('home');
  const dirs = [
    path.join(home, 'Library', 'Application Support', 'Macromedia'),
    path.join(home, 'Library', 'Application Support', 'Macromedia', 'Flash Player'),
    path.join(home, 'Library', 'Preferences', 'Macromedia', 'Flash Player')
  ];
  dirs.forEach(d => {
    try {
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'mms.cfg'), MMS_CFG);
    } catch (e) { log('mms.cfg skipped: ' + e.message); }
  });
}

function log(msg) {
  console.log('[XXL] ' + msg);
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    title: '开心消消乐 · QQ空间PC版',
    backgroundColor: '#FFF6E8',
    webPreferences: {
      plugins: true,                  // 关键：允许 Pepper Flash
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: true,
      partition: PARTITION            // 登录态持久化
    }
  });

  win.webContents.setUserAgent(currentUA);
  windows.push(win);
  win.on('closed', () => {
    const i = windows.indexOf(win);
    if (i >= 0) windows.splice(i, 1);
  });

  // 登录弹窗等新窗口：共享同一 session，保证 cookie 互通；更新弹窗一律拦掉
  win.webContents.on('new-window', (event, target) => {
    if (isUpdateUrl(target)) {
      event.preventDefault();
      blockedUpdates++;
      log('blocked update popup: ' + target);
      return;
    }
    event.preventDefault();
    createWindow(target);
  });

  win.webContents.on('will-navigate', (event, target) => {
    if (isUpdateUrl(target)) {
      event.preventDefault();
      blockedUpdates++;
      log('blocked update navigation: ' + target);
    }
  });

  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript("!!navigator.plugins.namedItem('Shockwave Flash')")
      .then(ok => log('page-loaded url=' + win.webContents.getURL() + ' flash=' + ok))
      .catch(() => {});
  });

  // 诊断用：模拟点击 Flash 占位符，验证是否能放行播放
  if (process.env.XXL_CLICK) {
    setTimeout(async () => {
      try {
        const r = await win.webContents.executeJavaScript(
          "(function(){var e=document.querySelector('embed');if(!e)return null;var b=e.getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2});})()");
        if (!r) return;
        const pt = JSON.parse(r);
        const dbg = win.webContents.debugger;
        dbg.attach('1.3');
        await dbg.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
        await dbg.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
        log('placeholder clicked at ' + pt.x + ',' + pt.y);
      } catch (e) { log('click failed: ' + e.message); }
    }, 2500);
  }

  // 诊断：导出页面 DOM，判断占位是浏览器画的还是插件画的
  if (process.env.XXL_DOM_DUMP) {
    setTimeout(() => {
      win.webContents.executeJavaScript('document.documentElement.outerHTML')
        .then(html => { fs.writeFileSync(process.env.XXL_DOM_DUMP, html); log('dom dumped'); })
        .catch(e => log('dom dump failed: ' + e.message));
    }, 4000);
  }

  // 诊断：用 CDP 穿透 shadow DOM 导出，判断占位归属
  if (process.env.XXL_CDP_DUMP) {
    setTimeout(async () => {
      try {
        const dbg = win.webContents.debugger;
        dbg.attach('1.3');
        const doc = await dbg.sendCommand('DOM.getDocument', { depth: -1, pierce: true });
        const html = await dbg.sendCommand('DOM.getOuterHTML', { nodeId: doc.root.nodeId });
        fs.writeFileSync(process.env.XXL_CDP_DUMP, html.outerHTML);
        log('cdp dom dumped len=' + html.outerHTML.length);
        dbg.detach();
      } catch (e) { log('cdp failed: ' + e.message); }
    }, 4000);
  }

  // 内部渲染自检：设置环境变量 XXL_RENDER_PROBE=1 时把页面画面存盘（不依赖系统截屏）
  if (process.env.XXL_RENDER_PROBE) {
    setTimeout(() => {
      win.webContents.capturePage().then(img => {
        const p = process.env.XXL_CAPTURE_OUT || '/tmp/xxl_capture.png';
        fs.writeFileSync(p, img.toPNG());
        log('capture saved ' + p + ' size=' + JSON.stringify(img.getSize()));
      }).catch(e => log('capture failed: ' + e.message));
    }, 5000);
  }

  win.webContents.on('page-title-updated', (e, title) => {
    if (!title || title.indexOf('开心消消乐') < 0) {
      win.setTitle(title + ' — 开心消消乐 PC版');
    }
  });

  win.loadURL(url || HOME_URL).catch(err => log('loadURL error: ' + err.message));
  return win;
}

function activeWin() {
  return BrowserWindow.getFocusedWindow() || windows[0] || null;
}

function navigate(url) {
  const win = activeWin();
  if (win) win.loadURL(url).catch(err => log('nav error: ' + err.message));
  else createWindow(url);
}

function pasteAndOpen() {
  const text = (clipboard.readText() || '').trim();
  if (/^https?:\/\//i.test(text)) {
    navigate(text);
  } else {
    dialog.showMessageBox({
      type: 'info',
      buttons: ['好'],
      title: '粘贴网址',
      message: '剪贴板里不是网址',
      detail: '先复制一条 http:// 或 https:// 开头的链接，再点这个菜单。\n\n当前剪贴板：' + (text.slice(0, 120) || '(空)')
    });
  }
}

async function diagnostics() {
  const win = activeWin();
  if (!win) return;
  const js = `(function(){
    var ps=[]; for(var i=0;i<navigator.plugins.length;i++){var p=navigator.plugins[i];ps.push(p.name+' | '+p.description+' | '+p.filename);}
    return JSON.stringify({
      url: location.href,
      title: document.title,
      ua: navigator.userAgent,
      plugins: ps,
      shockwave: !!navigator.plugins.namedItem('Shockwave Flash'),
      mime: !!navigator.mimeTypes['application/x-shockwave-flash'],
      flash_elements: document.querySelectorAll('embed[type*="flash"],object[type*="flash"],embed[src$=".swf"]').length,
      swf_refs: (document.documentElement.innerHTML.match(/[a-z0-9_./:?=&%-]+\\.swf/gi)||[]).slice(0,8)
    },null,2);
  })()`;
  let result;
  try {
    result = await win.webContents.executeJavaScript(js);
  } catch (e) {
    result = '读取页面失败：' + e.message;
  }
  const full = '=== 开心消消乐 PC版 诊断 ===\n'
    + '插件路径: ' + PLUGIN + '\n'
    + '插件存在: ' + fs.existsSync(PLUGIN) + '\n'
    + 'Electron: ' + process.versions.electron + ' / Chromium: ' + process.versions.chrome + '\n'
    + 'Flash 进程: ' + JSON.stringify(app.getAppMetrics().filter(m => m.type === 'Pepper Plugin').map(m => m.name)) + '\n\n'
    + result;
  clipboard.writeText(full);
  dialog.showMessageBox({
    type: 'info',
    buttons: ['好'],
    title: '诊断信息已复制',
    message: '已复制到剪贴板，可直接粘贴发给我排查。',
    detail: full.slice(0, 900)
  });
}

async function clearSession() {
  const r = await dialog.showMessageBox({
    type: 'question',
    buttons: ['取消', '清除并重启'],
    defaultId: 0,
    cancelId: 0,
    title: '清除登录状态',
    message: '会退出登录（游戏进度在腾讯服务器上，不会丢），需要重新扫码。确定吗？'
  });
  if (r.response !== 1) return;
  await session.fromPartition(PARTITION).clearStorageData();
  app.relaunch();
  app.exit(0);
}

function buildMenu() {
  const tpl = [
    {
      label: '游戏',
      submenu: [
        { label: '打开 QQ 空间游戏', accelerator: 'CmdOrCtrl+H', click: () => navigate(HOME_URL) },
        { label: '打开 QQ 空间首页（先登录）', click: () => navigate(LOGIN_URL) },
        { label: '打开完整分享链接（备用）', click: () => navigate(SHARE_URL) },
        { type: 'separator' },
        { label: '粘贴网址并打开', accelerator: 'CmdOrCtrl+L', click: pasteAndOpen },
        { label: '重新载入', accelerator: 'CmdOrCtrl+R', click: () => { const w = activeWin(); if (w) w.reload(); } },
        { label: '后退', accelerator: 'CmdOrCtrl+[', click: () => { const w = activeWin(); if (w && w.webContents.canGoBack()) w.webContents.goBack(); } },
        { label: '前进', accelerator: 'CmdOrCtrl+]', click: () => { const w = activeWin(); if (w && w.webContents.canGoForward()) w.webContents.goForward(); } },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '设置',
      submenu: [
        {
          label: 'Windows Chrome 87 标识（推荐）', type: 'radio', checked: true,
          click: () => { currentUA = UA_WIN; windows.forEach(w => w.webContents.setUserAgent(UA_WIN)); navigate(HOME_URL); }
        },
        {
          label: 'Mac Chrome 87 标识', type: 'radio', checked: false,
          click: () => { currentUA = UA_MAC; windows.forEach(w => w.webContents.setUserAgent(UA_MAC)); navigate(HOME_URL); }
        },
        { type: 'separator' },
        { label: '在新窗口打开', accelerator: 'CmdOrCtrl+N', click: () => createWindow(HOME_URL) },
        { label: '清除登录状态并重启', click: clearSession }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: 'Flash 自检页', click: () => { const w = activeWin(); if (w) w.loadFile(SELFTEST).catch(e => log(e.message)); else createWindow('file://' + SELFTEST); } },
        { label: '复制诊断信息', click: diagnostics },
        { type: 'separator' },
        { label: '关于', click: () => dialog.showMessageBox({
          type: 'info', buttons: ['好'], title: '关于',
          message: '开心消消乐 · QQ空间 PC版',
          detail: 'Chromium 87 + 内置 Adobe Flash PPAPI 34.0.0.372\n'
            + '已打 OOD 补丁，禁用自动更新与 Flash Center 检查\n\n'
            + '首次使用：菜单「游戏 → 打开 QQ 空间首页」扫码登录，\n'
            + '再点「打开 QQ 空间游戏」即可。登录状态会一直保留。'
        }) }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.on('ready', () => {
  log('plugin=' + PLUGIN + ' exists=' + fs.existsSync(PLUGIN));
  // 每次启动都重写禁更新配置，保证 app 拷到任何一台 Mac 上都生效
  installNoUpdateConfig();
  const ses = session.fromPartition(PARTITION);
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    callback(['plugins', 'fullscreen', 'notifications', 'clipboard-read', 'media', 'background-sync'].indexOf(permission) >= 0);
  });
  // 拦截 Flash 更新/授权/OOD 检查请求（含插件进程发起的）
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (isUpdateUrl(details.url)) {
      blockedUpdates++;
      log('blocked update request: ' + details.url);
      callback({ cancel: true });
    } else {
      callback({ cancel: false });
    }
  });
  buildMenu();
  createWindow(process.env.XXL_TEST_URL ? process.env.XXL_TEST_URL
    : (process.env.XXL_SELFTEST ? ('file://' + SELFTEST) : HOME_URL));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (windows.length === 0) createWindow(HOME_URL);
});
