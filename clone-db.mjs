import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const conn = new Client();
const REMOTE_DB = 'artists_farm';
const REMOTE_USER = 'artist_farm';
const REMOTE_PASS = 'tPatel13@';
const LOCAL_DB = 'artists_farm_resort';
const DUMP_FILE = path.join(process.cwd(), 'production_dump.sql');

console.log('Connecting to production server...');
conn.on('ready', () => {
  console.log('Connected. Dumping database...');
  
  // Dump database via SSH exec
  conn.exec(`mysqldump -u${REMOTE_USER} -p'${REMOTE_PASS}' ${REMOTE_DB} --single-transaction --routines --triggers 2>/dev/null`, (err, stream) => {
    if (err) {
      console.error('SSH exec error:', err.message);
      conn.end();
      return;
    }
    
    let data = '';
    stream.on('data', (chunk) => { data += chunk.toString(); });
    stream.stderr?.on('data', (chunk) => { 
      const msg = chunk.toString();
      if (!msg.includes('Warning') && !msg.includes('Using')) console.error('STDERR:', msg);
    });
    stream.on('close', () => {
      // Remove MariaDB 10.6+ specific syntax that local 10.4 doesn't understand
      data = data.replace(/^\/\*M!999999\\.*?\*\//m, '');
      fs.writeFileSync(DUMP_FILE, data);
      console.log(`Dump saved: ${(data.length / 1024 / 1024).toFixed(2)} MB`);
      conn.end();
      
      // Import into local MySQL
      console.log(`Importing into local MySQL database: ${LOCAL_DB}...`);
      try {
        // Drop and recreate database
        execSync('"C:\\xampp\\mysql\\bin\\mysql.exe" -u root -e "DROP DATABASE IF EXISTS `' + LOCAL_DB + '`; CREATE DATABASE `' + LOCAL_DB + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"', { stdio: 'inherit' });
        // Import
        execSync('"C:\\xampp\\mysql\\bin\\mysql.exe" -u root --force ' + LOCAL_DB + ' < "' + DUMP_FILE + '"', { stdio: 'inherit' });
        console.log('');
        console.log('=== DATABASE CLONED SUCCESSFULLY ===');
        
        // Verify
        const result = execSync('"C:\\xampp\\mysql\\bin\\mysql.exe" -u root -e "SELECT COUNT(*) as tables_count FROM information_schema.tables WHERE table_schema=\'' + LOCAL_DB + '\';"', { encoding: 'utf8' });
        console.log(result);
        
        // Cleanup
        fs.unlinkSync(DUMP_FILE);
        console.log('Local database is ready!');
        console.log('Run: npm run dev');
      } catch (e) {
        console.error('Import failed:', e.message);
      }
    });
  });
}).on('error', (err) => {
  console.error('Connection failed:', err.message);
}).connect({
  host: '91.238.163.173',
  port: 88,
  username: 'apartment',
  password: 'tPatel13@',
});
