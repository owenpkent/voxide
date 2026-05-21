const { execSync } = require('child_process');
const path = require('path');

// Custom signing script with retry logic to handle Windows Defender file locks
exports.default = async function(configuration) {
  const filePath = configuration.path;
  const sha1 = 'fc22b5221318f3f3f6b3eb2d969d7f99091557bf';
  const tsServer = 'http://timestamp.digicert.com';
  
  // Find signtool
  const signtool = path.join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Windows Kits', '10', 'bin', '10.0.22621.0', 'x64', 'signtool.exe'
  );
  
  // Try multiple common signtool paths
  const signtoolPaths = [
    signtool,
    'signtool.exe', // If in PATH
    path.join(process.env['ProgramFiles(x86)'] || '', 'Windows Kits', '10', 'App Certification Kit', 'signtool.exe'),
  ];
  
  let cmd;
  for (const st of signtoolPaths) {
    try {
      execSync(`"${st}" /?`, { stdio: 'ignore' });
      cmd = st;
      break;
    } catch (e) {
      continue;
    }
  }
  
  if (!cmd) {
    cmd = 'signtool.exe'; // fallback
  }

  const signCmd = `"${cmd}" sign /sha1 ${sha1} /fd sha256 /tr ${tsServer} /td sha256 "${filePath}"`;
  
  const maxRetries = 5;
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`[Sign] Attempt ${i + 1}: ${path.basename(filePath)}`);
      execSync(signCmd, { stdio: 'inherit', timeout: 60000 });
      console.log(`[Sign] Success: ${path.basename(filePath)}`);
      return;
    } catch (e) {
      if (i < maxRetries - 1) {
        const delay = (i + 1) * 2000;
        console.log(`[Sign] Retry in ${delay/1000}s (file may be locked by antivirus)...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw new Error(`Failed to sign ${filePath} after ${maxRetries} attempts: ${e.message}`);
      }
    }
  }
};
