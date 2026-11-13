const { spawn } = require('node:child_process');
const path = require('node:path');

const serverPath = path.join(__dirname, 'server.js');
const baseEnv = { ...process.env };
delete baseEnv.KOTAMITRA_ADMIN_EMAIL;
delete baseEnv.KOTAMITRA_ADMIN_PASSWORD;

function start(env, port) {
  return spawn(process.execPath, [serverPath], { env: { ...baseEnv, ...env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'ignore'] });
}
function exits(server, timeout = 1500) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { server.kill(); resolve(false); }, timeout);
    server.once('exit', code => { clearTimeout(timer); resolve(code !== 0); });
  });
}
async function waitForHealth(port) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { const response = await fetch(`http://localhost:${port}/api/health`); if (response.ok) return true; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return false;
}
async function run() {
  const missing = start({ NODE_ENV: 'production' }, 4201);
  const missingRejected = await exits(missing);

  const unsafe = start({ NODE_ENV: 'production', KOTAMITRA_ADMIN_EMAIL: 'admin@kotamitra.local', KOTAMITRA_ADMIN_PASSWORD: 'change-this-password' }, 4202);
  const unsafeRejected = await exits(unsafe);

  const valid = start({ NODE_ENV: 'production', KOTAMITRA_ADMIN_EMAIL: 'configured-admin@example.test', KOTAMITRA_ADMIN_PASSWORD: 'configured-test-password' }, 4203);
  const validStarted = await waitForHealth(4203);
  valid.kill();

  const development = start({ NODE_ENV: 'development' }, 4204);
  const developmentStarted = await waitForHealth(4204);
  development.kill();

  const checks = [
    ['production missing credentials rejected', missingRejected],
    ['production default credentials rejected', unsafeRejected],
    ['production configured credentials accepted', validStarted],
    ['development defaults remain compatible', developmentStarted]
  ];
  const failed = checks.filter(([, passed]) => !passed);
  if (failed.length) throw new Error(`Failed credential checks: ${failed.map(([name]) => name).join(', ')}`);
  console.log(`Credential tests passed: ${checks.length}`);
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
