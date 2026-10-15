# macOS 适配说明

## 开发与打包

使用 Node.js 24，项目 `.node-version` 固定版本。安装 fnm 后在 zsh 中启用 `fnm env --use-on-cd --shell zsh`，进入项目运行 `fnm install`、`fnm use`、`npm ci`。

```bash
npm start
npm test
npm run make -- --platform=darwin --arch=arm64
# Intel 目标；需要在 Intel Mac 上另行验证
npm run make -- --platform=darwin --arch=x64
```

打包输出位于 `out/<版本>/`。macOS 提供 `.app` 和 ZIP，Windows 保留 Squirrel 安装包和 ZIP。本次未加入 DMG、自动更新、Developer ID 签名或 Apple 公证。

也可以双击 `scripts/macos/start.command` 启动，或双击 `scripts/macos/build.command` 打包。脚本会自动定位项目根目录并加载 zsh 的登录及交互环境，支持已在 `.zshrc` 中配置的 fnm。Windows 对应入口位于 `scripts/windows/`，使用 `.cmd`；共享 npm 逻辑继续放在 `scripts/` 根目录。

## 平台行为

- 麦克风：应用包声明 `NSMicrophoneUsageDescription`，通过 Electron 请求系统许可；用户拒绝后须在系统设置中修改权限。
- 截图：读取屏幕录制授权状态。拒绝时返回系统设置指引；首次授权由系统截图接口触发。更改授权后可能需要完全重启应用。系统设置中的名称在开发模式下可能是 Electron。
- 窗口：保留现有无边框标题栏和透明模式，使用 macOS 应用菜单。关闭最后一个窗口后保留进程，Dock 激活重新创建窗口；`⌘ Q` 退出。
- 快捷键：Mac 界面显示 `⌘`，Windows 显示 `Ctrl`，主进程继续使用 `CommandOrControl`。
- 凭据：继续使用 Electron safeStorage，macOS 由钥匙串提供系统加密；不要假定 Windows 加密数据可直接迁移。
- 内容保护：macOS 上 ScreenCaptureKit 仍可能捕获受保护窗口，界面明确提示此限制。
- 图标：Mac 使用 `.icns`；原始 PNG 仅有 256 像素，更大尺寸由其缩放生成，未来可替换为高分辨率设计源。

## 验证范围

桌面测试使用独立数据目录、模拟模型接口和本地图片。截图业务用例使用合成屏幕来源，并在测试进程内模拟已授权状态，不录取用户桌面；这类用例验证截图处理流程，不能代替真实系统授权测试。

`tests/macos.test.cjs` 仅在 Mac 执行，验证快捷键标签、拒绝截图时的引导、关闭后进程保留、激活重开窗口及退出菜单。Windows 上跳过此用例。

本分支已在 macOS 14 / Apple 芯片、Node.js 24.22.0 环境完成验证：

- `npm test`：143 个测试全部通过，包含 Mac 专项测试。
- `npm run format:check` 和 `git diff --check`：通过。
- `npm run make`：成功生成 darwin/arm64 的 `.app` 和 ZIP；确认应用 Info.plist 包含麦克风用途说明。

这些结果不代表真实系统录音/截图授权及其他平台均已验证。

正式分发前需人工验证：

- 首次允许/拒绝麦克风后录音与转写，以及系统设置重新授权。
- 首次允许/拒绝屏幕录制、授权后重启及真实截图。
- Retina 和外接屏、多屏缩放、窗口跨屏、透明模式与置顶。
- Intel Mac 上的启动与相同桌面流程。
- Windows 安装包与原桌面流程回归。
- 对外发行的签名、公证和首次安装体验。

官方说明：[媒体权限](https://www.electronjs.org/docs/latest/api/system-preferences)、[内容保护限制](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows)。
