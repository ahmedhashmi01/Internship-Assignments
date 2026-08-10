const { spawnSync } = require('child_process');
const path = require('path');
const cwd = path.resolve(__dirname);
const npmPath = path.join(process.env['ProgramFiles'] || 'C:\Program Files', 'nodejs', 'npm.cmd');
console.log('cwd', cwd);
console.log('npmPath', npmPath);
const result = spawnSync(npmPath, ['install', 'cookie-parser'], { cwd, stdio: 'inherit' });
if (result.error) {
  console.error('ERROR', result.error);
  process.exit(1);
}
process.exit(result.status || 0);
