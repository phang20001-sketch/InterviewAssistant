# Windows 使用说明

## 下载

当前源码版本为 **1.5.2**，面向 **Windows x64**。**GitHub 已公开的下载仍为 1.5.1**，尚未包含新版后台截屏作答与焦点优化。打开 [Windows Release](https://github.com/phang20001-sketch/InterviewAssistant/releases/tag/v1.5.1-windows.1)，或按用途下载已发布版本：

| 文件                                                                                                                                                                  | 用途                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| [InterviewStudio-Setup-1.5.1.exe](https://github.com/phang20001-sketch/InterviewAssistant/releases/download/v1.5.1-windows.1/InterviewStudio-Setup-1.5.1.exe)         | 常规安装，安装后从开始菜单启动。 |
| [InterviewStudio-win32-x64-1.5.1.zip](https://github.com/phang20001-sketch/InterviewAssistant/releases/download/v1.5.1-windows.1/InterviewStudio-win32-x64-1.5.1.zip) | 完整解压后运行的便携包。         |
| [SHA256SUMS.txt](https://github.com/phang20001-sketch/InterviewAssistant/releases/download/v1.5.1-windows.1/SHA256SUMS.txt)                                           | 对照下载文件的 SHA-256 摘要。    |

直接使用应用**无需安装 Node.js，也不用运行 `.cmd` 脚本**。Release 页面中的“Source code”是源码，不能当作应用运行。安装包通过 Releases 分发，不放入 Git 源码仓库。

本地新构建的 `InterviewStudio-Setup-1.5.2.exe` 和 1.5.2 ZIP 尚未上传 GitHub；使用新功能时，请确认拿到的是 1.5.2，而不是上表的旧下载。应用未接入自动更新。

## 安装与启动

### EXE 安装包

1. 使用已发布版本时，下载上表的 `InterviewStudio-Setup-1.5.1.exe`；更新后台操作功能时，使用本地新构建的 `InterviewStudio-Setup-1.5.2.exe`。
2. 如已运行 1.5.0 或 1.5.1，先彻底退出旧应用；如果用了 `Ctrl + Shift + Space` 隐藏窗口，先恢复窗口再关闭。仍有后台进程时，在任务管理器中结束 Interview Studio。
3. 双击安装包，完成后从开始菜单打开 Interview Studio。
4. 更新后检查工作台左下角显示 **v1.5.2**。如果仍为旧版本，先确认旧进程已退出，再从新安装位置启动。
5. 进入“模型与设置”添加服务地址、模型名称和 API Key；也可先使用演示模式熟悉界面。

当前应用未配置商业代码签名，Windows 可能显示未知发布者。请先确认文件来自本仓库的 Release，再按系统提示操作；若单位设备策略阻止安装，请联系管理员，不要关闭安全防护。

### ZIP 便携包

1. 使用 GitHub 已发布版本时，下载 `InterviewStudio-win32-x64-1.5.1.zip`；新功能需要本地新构建的 1.5.2 ZIP。
2. 右键选择“全部解压”，选择独立文件夹并等待完整解压。
3. 打开解压目录，双击 `InterviewStudio.exe`。
4. 保留同目录的全部文件和文件夹，不要只复制 EXE，也不要直接在压缩包中运行。

1.5.1 带来石墨灰侧栏、暖白工作区、钢蓝选中提示、黑灰主按钮、新图标与空状态插图，并提高文字可读性。1.5.2 在此基础上增加后台截屏作答，并减少后台操作主动激活窗口的情况。

安装版与便携版继续读取同一 Windows 用户的本地资料。若同版本重装未替换程序，可把 ZIP 完整解压到新目录后启动。不要混拷不同构建的文件，也不要为更换程序删除数据目录。Setup 的实际安装验证范围见下文。

### 为什么打开新版后仍是旧版本

应用有单实例限制：旧版仍在运行时，打开新版、便携版或执行 `npm start`，也可能只是唤起原来的旧窗口。关闭或隐藏窗口不一定能说明进程已经退出，请检查任务管理器；退出旧进程后再启动新版，并以左下角的 **v1.5.2** 为准。修改源码、重新打开旧快捷方式，都不会自动更新已安装的程序。

## 1.5.2 后台截屏作答

1. 确认左下角为 **v1.5.2**，配置支持图片输入的模型。
2. 在“模型与设置 → 桌面与数据”打开“窗口置顶”并保存。
3. 回到浏览器或其他应用，按 **`Ctrl + Alt + Enter`** 截屏并作答；截图范围为工作台窗口所在屏幕。
4. 在置顶窗口查看回答。按 `Ctrl + Shift + T` 切换透明模式，按 `Ctrl + Shift + Space` 显示或隐藏窗口。

后台截图返回结果、显示窗口和切换透明模式使用不主动激活窗口的方式；点击工作台输入、手动选屏或打开文件对话框仍可能切换焦点。功能用于减少窗口打断，不能保证网页或其他软件无法感知操作。GitHub 目前的 1.5.1 下载不支持这些新行为。

## 校验下载文件

将安装包、ZIP 和 `SHA256SUMS.txt` 下载到同一个文件夹，在该文件夹打开 PowerShell：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\InterviewStudio-Setup-1.5.1.exe
Get-FileHash -Algorithm SHA256 -LiteralPath .\InterviewStudio-win32-x64-1.5.1.zip
Get-Content -LiteralPath .\SHA256SUMS.txt
```

把输出的 `Hash` 与摘要文件中对应文件名的值比较，字母大小写不影响比较。如果不一致，先重新下载；校验一致说明文件内容与发布附件一致，不代表应用已经获得代码签名或系统安全认证。

## 使用与本地数据

完整功能步骤和软件界面截图见 [项目使用文档](../../README.md)。初次使用建议依次配置模型、保存简历与面试偏好，再开始问答、模拟面试或生成题库。

数据默认保存在：

```text
%APPDATA%\Interview Studio\workspace.json
```

在“模型与设置 → 桌面与数据 → 打开数据目录”中可以查看。安装版与便携版都使用当前 Windows 用户的数据目录，ZIP 不是把资料自动存到解压文件夹的独立数据包。

迁移或备份时，先退出软件，再复制 `workspace.json`；文件包含私密简历与聊天记录，请不要上传 GitHub。API Key 使用系统加密，与当前用户或设备有关，换电脑后可能需要重新填写。更换应用文件不会自动删除资料；“清除所有会话”与手工删除数据目录的影响不同，详见主文档。

## 验证范围

已公开的 **Windows 1.5.1** 完成过以下检查，详情见 [Windows Release](https://github.com/phang20001-sketch/InterviewAssistant/releases/tag/v1.5.1-windows.1)。这些记录不表示该 Release 附件已经升级为 1.5.2：

- 完整源码测试：**142 项通过、0 项失败**；1 项 Mac 专项测试在 Windows 上跳过。
- 页面布局：五个页面在 1000 × 700 和 1320 × 880 两种窗口尺寸下的 10 项布局检查通过；480 × 620 透明窗口中，三个滑块、输入框及操作按钮均可使用，控件没有相互遮挡。
- `npm run make`：成功生成 1.5.1 EXE 与 ZIP，并收集到 `scripts/windows/installers/`。
- 发行 ZIP：完整解压到新目录，使用其中的 `InterviewStudio.exe`，在启动前指定的隔离全新数据目录中运行；无预置 Key、简历或会话，演示问答、透明模式、合成 PDF/DOCX 简历解析检查通过。
- 包内容：ASAR、ZIP 和 NUPKG 审查通过，包内界面文件与本次编译结果的摘要一致，仅包含运行所需依赖，没有工作区数据。主使用文档的 17 张截图已更新为 1.5.1 的软件窗口。

自动化桌面用例使用隔离数据和本地模拟接口，不调用真实付费模型；文档只截取软件窗口，使用示例资料。**尚未实际重装 Setup，也未验证 SmartScreen 首次安装**，打包成功与 ZIP 启动检查不能替代安装验证。

实际麦克风、真实截图、多显示器和会议共享接收端的显示效果仍需在使用环境中确认。透明模式与系统内容保护不能保证在所有共享软件中隐藏窗口。

## 开发与打包

只有修改源码或自行构建时才需要 Node.js。使用项目 `.node-version` 指定的版本，或符合主文档要求的 Node.js，在项目根目录执行：

```powershell
npm ci
npm test
npm run make
```

也可在安装依赖后双击：

- `start.cmd`：编译界面并启动开发应用。
- `build.cmd`：运行 `npm run make`，生成 Windows 安装包和 ZIP。

构建产物按 `package.json` 中的版本写入 `out/<版本>/`。当前源码 1.5.2 对应：

- EXE：`out/1.5.2/make/squirrel.windows/x64/InterviewStudio-Setup.exe`。
- ZIP：`out/1.5.2/make/zip/win32/x64/` 下的 ZIP。

构建完成后，收集脚本还会把分发包复制到本目录的 `installers/`。Release 中的 EXE 添加了版本号，便于识别下载文件；源码仓库只保留脚本，不提交生成的安装包。克隆源码后没有本地安装包属于正常情况。

当前未接入自动更新。发布新版本时需重新下载相应应用包，退出旧程序后再安装或替换。

**无需登录，所有配置与使用记录保存在本地。** 使用真实 AI 时，本次请求所需的文字、简历、面试偏好、截图或音频仍会发送给你配置的模型或转写服务，本地保存不等于完全离线。
