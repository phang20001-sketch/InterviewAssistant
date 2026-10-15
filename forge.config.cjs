const path = require('node:path');
const { version } = require('./package.json');
const { buildRenderer } = require('./scripts/build-renderer.cjs');

module.exports = {
  outDir: path.join(__dirname, 'out', version),
  hooks: {
    prePackage: () => buildRenderer(),
  },
  packagerConfig: {
    asar: true,
    icon: './assets/icon.ico',
    executableName: 'InterviewStudio',
    appBundleId: 'com.interviewstudio.desktop',
    appCopyright: 'Copyright © 2026 Interview Studio',
    ignore: [
      /^\/out(?:\/|$)/,
      /^\/work(?:\/|$)/,
      /^\/tests(?:\/|$)/,
      /^\/\.tools(?:\/|$)/,
      /^\/scripts(?:\/|$)/,
      /^\/\.git(?:\/|$)/,
      /^\/outputs(?:\/|$)/,
      /^\/src\/renderer(?:\/|$)/,
      /^\/vite\.config\.mjs$/,
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
      config: {
        name: 'InterviewStudio',
        authors: 'Interview Studio',
        description: '面试工作台：AI 回答、截图解析、语音转写与本地复盘',
        setupExe: 'InterviewStudio-Setup.exe',
        setupIcon: './assets/icon.ico',
        noMsi: true,
      },
    },
    { name: '@electron-forge/maker-zip', platforms: ['win32'] },
  ],
};
