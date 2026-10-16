# Windows 使用说明

## 下载

当前应用版本为 **1.5.0**，发布包面向 **Windows x64**。打开 [Windows Release](https://github.com/phang20001-sketch/InterviewAssistant/releases/tag/v1.5.0-windows.1)，或按用途直接下载：

| 文件                                                                                                                                                                  | 用途                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| [InterviewStudio-Setup-1.5.0.exe](https://github.com/phang20001-sketch/InterviewAssistant/releases/download/v1.5.0-windows.1/InterviewStudio-Setup-1.5.0.exe)         | 常规安装，安装后从开始菜单启动。 |
| [InterviewStudio-win32-x64-1.5.0.zip](https://github.com/phang20001-sketch/InterviewAssistant/releases/download/v1.5.0-windows.1/InterviewStudio-win32-x64-1.5.0.zip) | 完整解压后运行的便携包。         |
| [SHA256SUMS.txt](https://github.com/phang20001-sketch/InterviewAssistant/releases/download/v1.5.0-windows.1/SHA256SUMS.txt)                                           | 对照下载文件的 SHA-256 摘要。    |

直接使用应用**无需安装 Node.js，也不用运行 `.cmd` 脚本**。Release 页面中的“Source code”是源码，不能当作应用运行。安装包通过 Releases 分发，不放入 Git 源码仓库。

## 安装与启动

### EXE 安装包

1. 下载 `InterviewStudio-Setup-1.5.0.exe`。
2. 如已运行旧版本，先关闭窗口退出应用；如果用了 `Ctrl + Shift + Space` 隐藏窗口，先恢复窗口再关闭。
3. 双击安装包，完成后从开始菜单打开 Interview Studio。
4. 进入“模型与设置”添加服务地址、模型名称和 API Key；也可先使用演示模式熟悉界面。

当前应用未配置商业代码签名，Windows 可能显示未知发布者。请先确认文件来自本仓库的 Release，再按系统提示操作；若单位设备策略阻止安装，请联系管理员，不要关闭安全防护。

### ZIP 便携包

1. 下载 `InterviewStudio-win32-x64-1.5.0.zip`。
2. 右键选择“全部解压”，选择独立文件夹并等待完整解压。
3. 打开解压目录，双击 `InterviewStudio.exe`。
4. 保留同目录的全部文件和文件夹，不要只复制 EXE，也不要直接在压缩包中运行。

本次发布的应用版本仍为 1.5.0。新用户可直接使用 Setup 安装。已安装同版本、想使用本次构建的用户，建议先退出旧程序，再把 ZIP 完整解压到新目录，运行其中的新 EXE，软件会读取原有本地资料。不要混拷两次打包的文件，也不要依赖同版本安装包一定替换已有程序；请勿为了更换程序而删除数据目录。

## 校验下载文件

将安装包、ZIP 和 `SHA256SUMS.txt` 下载到同一个文件夹，在该文件夹打开 PowerShell：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\InterviewStudio-Setup-1.5.0.exe
Get-FileHash -Algorithm SHA256 -LiteralPath .\InterviewStudio-win32-x64-1.5.0.zip
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

本次发布在 Windows 10 x64 上完成以下检查，详情见对应 [Release 说明](https://github.com/phang20001-sketch/InterviewAssistant/releases/tag/v1.5.0-windows.1)：

- 源码测试 **142 项通过、0 项失败**；1 项 Mac 专项测试在 Windows 上跳过。
- `npm run make` 成功生成 EXE 与 ZIP，并收集到 `scripts/windows/installers/`。
- 发行 ZIP 完整解压到新目录后，使用其中的 `InterviewStudio.exe` 在隔离的全新数据目录中启动；确认没有预置 Key、简历和会话，演示问答、透明模式开关、合成 PDF/DOCX 简历解析均通过。
- 打包白名单仅保留运行所需内容，项目根目录的文档、测试与开发辅助目录不进入应用包。

自动化桌面用例使用隔离数据和本地模拟接口，不调用真实付费模型；截图用例不读取用户桌面。**本次尚未执行 Setup 安装或 SmartScreen 首次安装检查**，打包成功与应用启动通过不能替代安装验证。

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

构建产物按 `package.json` 中的版本写入 `out/<版本>/`。对于 1.5.0：

- EXE：`out/1.5.0/make/squirrel.windows/x64/InterviewStudio-Setup.exe`。
- ZIP：`out/1.5.0/make/zip/win32/x64/` 下的 ZIP。

构建完成后，收集脚本还会把分发包复制到本目录的 `installers/`。Release 中的 EXE 添加了版本号，便于识别下载文件；源码仓库只保留脚本，不提交生成的安装包。克隆源码后没有本地安装包属于正常情况。

当前未接入自动更新。发布新版本时需重新下载相应应用包，退出旧程序后再安装或替换。

**无需登录，所有配置与使用记录保存在本地。** 使用真实 AI 时，本次请求所需的文字、简历、面试偏好、截图或音频仍会发送给你配置的模型或转写服务，本地保存不等于完全离线。
