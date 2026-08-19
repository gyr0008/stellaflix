import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Stellaflix 开发模式：Vite dev server (:5173) + Electron (--vite 分支)
// 顺序启动：先清端口 → 起 Vite → 等 5173 就绪 → 再起 Electron
// 这样 Electron 的 waitForViteServer 几乎瞬间通过，不会超时

async function killPort(port) {
  try {
    const { stdout } = await execFileAsync('netstat', ['-ano'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const line = stdout
      .split('\n')
      .find((l) => l.includes(`:${port} `) && l.includes('LISTENING'));
    if (line) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && Number(pid) > 0) {
        console.log(`[dev] Killing stale process on port ${port} (PID ${pid})...`);
        try {
          await execFileAsync('taskkill', ['/PID', pid, '/F'], {
            encoding: 'utf8',
            timeout: 5000,
          });
        } catch {
          // 进程可能已自行退出，忽略
        }
      }
    }
  } catch {
    // netstat 不可用时静默跳过
  }
}

function waitForPort(port, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryConnect = () => {
      const sock = createServer();
      sock.once('error', () => {
        sock.close();
        if (Date.now() < deadline) {
          setTimeout(tryConnect, 200);
        } else {
          reject(new Error(`Port ${port} did not become available within ${timeoutMs}ms`));
        }
      });
      sock.once('listening', () => {
        sock.close();
        resolve();
      });
      try {
        sock.connect(port, '127.0.0.1');
      } catch {
        sock.close();
        if (Date.now() < deadline) {
          setTimeout(tryConnect, 200);
        }
      }
    };
    tryConnect();
  });
}

await killPort(5173);

console.log('[dev] Starting Vite dev server...');
const vite = spawn('npx', ['vite', '--config', 'vite.config.mjs'], {
  stdio: 'inherit',
  shell: true,
  cwd: ROOT,
});

// 等待 Vite 在 5173 上就绪（最多 60 秒）
try {
  await waitForPort(5173, 60000);
  console.log('[dev] Vite ready on http://127.0.0.1:5173 — launching Electron...');
} catch (err) {
  console.error('[dev]', err.message);
  vite.kill();
  process.exit(1);
}

// 使用项目本地 electron 二进制
const electronBin = join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');

const electron = spawn(electronBin, ['.', '--vite'], {
  stdio: 'inherit',
  cwd: ROOT,
});

electron.on('exit', () => {
  try { vite.kill(); } catch (_) {}
  process.exit(0);
});
