// Keep this launcher compatible with the computer's existing Node.js 16.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const command = process.argv[2] || 'start';
const [major, minor] = process.versions.node.split('.').map(Number);
const portableRuntime = path.join(
  root,
  '.tools',
  process.platform === 'win32' ? 'node.exe' : 'node',
);
const runtime =
  major > 22 || (major === 22 && minor >= 13)
    ? process.execPath
    : fs.existsSync(portableRuntime)
      ? portableRuntime
      : null;
if (!runtime) {
  console.error(
    '需要 Node.js 22.13 或更新版本。安装后重新打开终端，再执行 npm install 和 npm start。',
  );
  process.exit(1);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path';
env[pathKey] = path.dirname(runtime) + path.delimiter + (env[pathKey] || '');
const portableNpm = path.join(root, '.tools', 'node_modules', 'npm');
if (fs.existsSync(path.join(portableNpm, 'package.json'))) {
  const npmVersion = JSON.parse(
    fs.readFileSync(path.join(portableNpm, 'package.json'), 'utf8'),
  ).version;
  env[pathKey] = path.join(root, '.tools', 'node_modules', '.bin') + path.delimiter + env[pathKey];
  env.npm_execpath = path.join(portableNpm, 'bin', 'npm-cli.js');
  env.npm_node_execpath = runtime;
  env.npm_config_user_agent = 'npm/' + npmVersion;
}
let args;
if (command === 'build') {
  args = [path.join(root, 'scripts', 'build-renderer.cjs')];
} else if (command === 'test') {
  const tests = fs
    .readdirSync(path.join(root, 'tests'))
    .filter((name) => name.endsWith('.test.cjs'))
    .map((name) => path.join(root, 'tests', name));
  // Native windows and global shortcuts share the desktop, even with isolated data directories.
  args = ['--test', '--test-concurrency=1', ...tests];
} else {
  args = [
    path.join(root, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js'),
    command,
    ...process.argv.slice(3),
  ];
}
function run(childArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(runtime, childArgs, {
      cwd: root,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code == null ? 1 : code));
  });
}

async function launch() {
  if (command === 'start' || command === 'test') {
    const code = await run([path.join(root, 'scripts', 'build-renderer.cjs')]);
    if (code !== 0) return code;
  }
  return run(args);
}

launch().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error('启动失败：' + error.message);
    process.exitCode = 1;
  },
);
