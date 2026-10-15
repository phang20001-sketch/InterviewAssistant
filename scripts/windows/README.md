# Windows 用户使用说明

## 当前状态

Windows 安装包目录 `installers/` 已预留，本次不提供或验证 Windows 安装包。普通用户请等待后续 Windows 发布版本；无需为了使用软件安装 Node.js。

## 后续安装包的使用方式

维护者提供安装包后：

- `InterviewStudio-Setup.exe`：双击并按安装向导操作，之后从开始菜单启动。
- 名称包含 `win32-x64` 的 ZIP：选择“全部解压”，双击解压目录中的 `InterviewStudio.exe`；保留同目录的全部文件，不要只复制 EXE。

## 开发入口

以下脚本供开发者使用，不是普通用户的启动入口；首次需安装 Node.js 并在项目根目录运行 `npm ci`。

- `start.cmd`：启动开发应用。
- `build.cmd`：在 Windows 上构建；成功后将安装包与 ZIP 复制到 `installers/`。

安装包是生成文件，不提交到 Git 源码仓库；后续应通过分发包或 Releases 提供。
