const path = require('node:path');
const { version } = require('./package.json');
const { collectInstallers } = require('./scripts/collect-installers.cjs');
const { buildRenderer } = require('./scripts/build-renderer.cjs');

module.exports = {
  outDir: path.join(__dirname, 'out', version),
  hooks: {
    prePackage: () => buildRenderer(),
    postMake: (_config, results) => collectInstallers(results),
  },
  packagerConfig: {
    asar: true,
    icon: './assets/icon',
    extendInfo: {
      NSMicrophoneUsageDescription: '录制麦克风声音，将面试问题转换为文字。',
    },
    executableName: 'InterviewStudio',
    appBundleId: 'com.interviewstudio.desktop',
    appCopyright: 'Copyright © 2026 Interview Studio',
    ignore: [
      // Only ship runtime files; .gitignore does not control package contents.
      /^\/(?!(?:package\.json|src|dist|assets|node_modules)(?:\/|$))/,
      /^\/src\/renderer(?:\/|$)/,
      /\.cmd$/,
    ],
    win32metadata: {
      CompanyName: 'Interview Studio',
      FileDescription: 'Interview Studio 面试工作台',
      ProductName: 'Interview Studio',
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'InterviewStudio',
        authors: 'Interview Studio',
        description: '面试工作台：AI 回答、截图解析、语音转写与本地复盘',
        setupExe: 'InterviewStudio-Setup.exe',
        setupIcon: './assets/icon.ico',
        noMsi: true,
      },
    },
    { name: '@electron-forge/maker-zip', platforms: ['win32', 'darwin'] },
  ],
};
