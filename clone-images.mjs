import SftpClient from 'ssh2-sftp-client';
import path from 'path';
import fs from 'fs';

const sftp = new SftpClient();

const config = {
  host: '91.238.163.173',
  port: 88,
  username: 'apartment',
  password: 'tPatel13@',
  readyTimeout: 15000,
};

const REMOTE = '/home/apartment/artistsfarmjaipur.com/artist_farm/php/uploads/images';
const LOCAL = path.join(process.cwd(), 'php', 'uploads', 'images');

async function downloadDir(remoteDir, localDir) {
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
  const list = await sftp.list(remoteDir);
  let count = 0;
  for (const item of list) {
    if (item.type === 'd') {
      count += await downloadDir(`${remoteDir}/${item.name}`, path.join(localDir, item.name));
    } else if (item.type === '-') {
      const localPath = path.join(localDir, item.name);
      if (!fs.existsSync(localPath)) {
        await sftp.get(`${remoteDir}/${item.name}`, localPath);
        count++;
      }
    }
  }
  return count;
}

async function main() {
  console.log('Connecting to production...');
  await sftp.connect(config);
  console.log('Connected!');

  console.log('Downloading images...');
  const count = await downloadDir(REMOTE, LOCAL);
  console.log(`Downloaded ${count} new images`);

  console.log('Listing local images...');
  const listLocal = (dir) => {
    let files = 0;
    if (!fs.existsSync(dir)) return 0;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory()) files += listLocal(path.join(dir, item.name));
      else files++;
    }
    return files;
  };
  console.log(`Total local images: ${listLocal(LOCAL)}`);

  sftp.end();
  console.log('Done!');
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
