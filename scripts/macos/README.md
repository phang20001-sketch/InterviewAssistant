# Mac 使用说明

## 下载与安装

1. [下载 Apple 芯片版 ZIP](https://github.com/phang20001-sketch/InterviewAssistant/releases/download/v1.5.0-macos.1/Interview.Studio-darwin-arm64-1.5.0.zip)，双击解压。
2. 将 `Interview Studio.app` 拖入 Finder 的“应用程序”文件夹。
3. 打开应用，在“模型与设置”中填写服务地址、模型名称和 API Key。也可以先使用演示模式熟悉界面。

直接使用应用无需安装 Node.js，也不用运行 `.command` 脚本。当前只提供 Apple 芯片版，Intel Mac 的 `darwin-x64` 包暂未发布。

[Releases 页面](https://github.com/phang20001-sketch/InterviewAssistant/releases/tag/v1.5.0-macos.1)中的 Assets 包含应用 ZIP；“Source code”是源码，不能直接运行。

## 首次打开

当前应用尚未签名公证。确认下载来源后，可在“系统设置 → 隐私与安全性”中按提示选择“仍要打开”。如果没有该选项，或系统仍提示损坏、无法验证，请联系维护者。

首次使用录音或截图时，请允许相应权限。曾经拒绝过的，可到“系统设置 → 隐私与安全性”中重新开启：

- **麦克风**：找到 Interview Studio 并开启。
- **屏幕与系统音频录制**：找到 Interview Studio 并开启；部分系统将此项称为“屏幕录制”。

修改权限后，按 `⌘ Q` 退出应用再重新打开。开发模式下，权限列表中的名称可能是 Electron。

关闭窗口后应用仍在运行，点击 Dock 图标可以重开；`⌘ Q` 完全退出。录音只采集麦克风声音。macOS 的内容保护无法阻止所有录屏软件捕获窗口。

## 开发与打包

安装项目要求的 Node.js，在项目根目录执行 `npm ci`，之后可双击：

- `start.command`：启动开发应用。
- `build.command`：生成应用 ZIP，并复制到当前目录的 `installers/` 文件夹。

安装包不提交到 Git，统一通过 Releases 分发。克隆源码后没有 `installers/` 属于正常情况，自行打包后会生成该目录。
