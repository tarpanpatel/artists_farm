const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');

const sftp = new SftpClient();

const config = {
  host: '91.238.163.173',
  port: 88,
  username: 'apartment',
  password: 'tPatel13@',
  readyTimeout: 15000,
};

const LOCAL_ROOT = __dirname;
const REMOTE_ROOT = '/home/apartment/public_html';

async function uploadDir(localDir, remoteDir) {
  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);
    const remotePath = `${remoteDir}/${entry.name}`;
    if (entry.isDirectory()) {
      try { await sftp.mkdir(remotePath, true); } catch {}
      await uploadDir(localPath, remotePath);
    } else {
      try {
        await sftp.put(localPath, remotePath);
      } catch (err) {
        console.error(`  ERROR uploading ${remotePath}:`, err.message);
      }
    }
  }
}

async function main() {
  console.log('Connecting to production server...');
  await sftp.connect(config);
  console.log('Connected!');

  // Upload dist/
  console.log('Uploading dist/ ...');
  await uploadDir(path.join(LOCAL_ROOT, 'dist'), `${REMOTE_ROOT}/dist`);
  console.log('dist/ done');

  // Upload php/
  console.log('Uploading php/ ...');
  await uploadDir(path.join(LOCAL_ROOT, 'php'), `${REMOTE_ROOT}/php`);
  console.log('php/ done');

  // Upload root files
  for (const file of ['index.php', 'index.html']) {
    const local = path.join(LOCAL_ROOT, file);
    if (fs.existsSync(local)) {
      console.log(`Uploading ${file} ...`);
      await sftp.put(local, `${REMOTE_ROOT}/${file}`);
    }
  }

  // Delete old JS/CSS bundles from dist/assets (new ones have different hashes)
  console.log('Cleaning old bundles...');
  try {
    const remoteFiles = await sftp.list(`${REMOTE_ROOT}/dist/assets`);
    const currentFiles = fs.readdirSync(path.join(LOCAL_ROOT, 'dist', 'assets'));
    const currentNames = new Set(currentFiles);
    for (const f of remoteFiles) {
      if (f.type === '-' && f.name.endsWith('.js') && !currentNames.has(f.name)) {
        await sftp.delete(`${REMOTE_ROOT}/dist/assets/${f.name}`);
        console.log(`  Deleted old: ${f.name}`);
      }
      if (f.type === '-' && f.name.endsWith('.css') && !currentNames.has(f.name)) {
        await sftp.delete(`${REMOTE_ROOT}/dist/assets/${f.name}`);
        console.log(`  Deleted old: ${f.name}`);
      }
    }
  } catch (e) {
    console.log('  Cleanup skipped:', e.message);
  }

  console.log('');
  console.log('=== DEPLOY COMPLETE ===');
  console.log('Live: https://artistsfarmjaipur.com/artist_farm/');
  sftp.end();
}

main().catch(err => {
  console.error('DEPLOY FAILED:', err.message);
  process.exit(1);
});
