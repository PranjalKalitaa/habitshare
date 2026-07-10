// tunnel.js — Keeps localtunnel running in a loop and logs any changes to the URL
const { spawn } = require('child_process');

function startTunnel() {
  console.log('[Tunnel] Starting localtunnel on port 3000...');
  
  // Run npx localtunnel --port 3000 --local-host 127.0.0.1
  const child = spawn('npx', ['localtunnel', '--port', '3000', '--local-host', '127.0.0.1'], {
    shell: true,
    cwd: __dirname
  });

  child.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[Tunnel Log] ${output.trim()}`);
  });

  child.stderr.on('data', (data) => {
    console.error(`[Tunnel Error] ${data.toString().trim()}`);
  });

  child.on('close', (code) => {
    console.warn(`[Tunnel] Process exited with code ${code}. Restarting in 5 seconds...`);
    setTimeout(startTunnel, 5000);
  });
}

startTunnel();
