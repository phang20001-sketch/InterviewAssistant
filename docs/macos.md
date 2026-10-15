# macOS 适配说明

## 开发与打包

项目使用 Node.js 24，具体版本记录在 `.node-version`。如果使用 fnm，先在 `.zshrc` 中加入 `eval "$(fnm env --use-on-cd --shell zsh)"`，再进入项目运行 `fnm install`、`fnm use` 和 `npm ci`。

```bash
npm start
npm test
npm run make -- --platform=darwin --arch=arm64
# Intel 目标；需要在 Intel Mac 上另行验证
npm run make -- --platform=darwin --arch=x64
```

打包输出位于 `out/<版本>/`。macOS 提供 `.app` 和 ZIP，Windows 保留 Squirrel 安装包和 ZIP。暂不提供 DMG 和自动更新，Mac 包尚未配置 Developer ID 签名及 Apple 公证。

也可以双击 `scripts/macos/start.command` 启动，或双击 `scripts/macos/build.command` 打包。脚本会自动定位项目根目录并加载 zsh 的登录及交互环境，支持已在 `.zshrc` 中配置的 fnm。Windows 对应入口位于 `scripts/windows/`，使用 `.cmd`；共享 npm 逻辑继续放在 `scripts/` 根目录。

## 平台行为

- 麦克风：应用包声明 `NSMicrophoneUsageDescription`，通过 Electron 请求系统许可；用户拒绝后须在系统设置中修改权限。
- 截图：先检查屏幕录制权限。没有权限时提示用户前往系统设置，首次授权由系统截图接口触发。更改授权后可能需要完全重启应用。系统设置中的名称在开发模式下可能是 Electron。
- 窗口：保留现有无边框标题栏和透明模式，使用 macOS 应用菜单。关闭最后一个窗口后应用继续运行，点击 Dock 图标重开；`⌘ Q` 退出。
- 快捷键：Mac 界面显示 `⌘`，Windows 显示 `Ctrl`，主进程继续使用 `CommandOrControl`。
- 凭据：使用 Electron safeStorage，Mac 上由钥匙串加密。Windows 保存的加密 Key 可能无法直接迁移到 Mac，需要重新填写。
- 内容保护：macOS 上 ScreenCaptureKit 仍可能捕获受保护窗口，界面明确提示此限制。
- 图标：Mac 使用 `.icns`；原始 PNG 为 256 像素，大尺寸图标由它放大生成，清晰度有限。

## 验证范围

桌面测试使用独立数据目录和模拟模型接口。截图测试读取本地图片，并模拟已授权状态，不截取用户桌面。它能验证截图处理流程，实际系统授权仍需手动检查。

`tests/macos.test.cjs` 仅在 Mac 执行，验证快捷键标签、拒绝截图时的引导、关闭后进程保留、激活重开窗口及退出菜单。Windows 上跳过此用例。

macOS 适配时的验证环境为 macOS 14、Apple 芯片和 Node.js 24.22.0，结果如下：

- `npm test`：143 个测试全部通过，包含 Mac 专项测试。
- `npm run format:check` 和 `git diff --check`：通过。
- `npm run make`：成功生成 darwin/arm64 的 `.app` 和 ZIP；确认应用 Info.plist 包含麦克风用途说明。

以下项目尚需人工验证：

- 首次允许/拒绝麦克风后录音与转写，以及系统设置重新授权。
- 首次允许/拒绝屏幕录制、授权后重启及真实截图。
- Retina 和外接屏、多屏缩放、窗口跨屏、透明模式与置顶。
- Intel Mac 上的启动与相同桌面流程。
- Windows 安装包与原桌面流程回归。
- 对外发行的签名、公证和首次安装体验。

官方说明：[媒体权限](https://www.electronjs.org/docs/latest/api/system-preferences)、[内容保护限制](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows)。
