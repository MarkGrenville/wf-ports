#!/usr/bin/env node
/**
 * Alfred Workflow Installer for Portio
 * Creates a symlink in Alfred's workflows directory
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Find Alfred workflows directory - check custom sync folder first, then default
function findAlfredWorkflowsDir() {
  // Check if Alfred has a custom sync folder configured
  try {
    const syncFolder = execSync('defaults read com.runningwithcrayons.Alfred-Preferences syncfolder 2>/dev/null', { encoding: 'utf8' }).trim();
    if (syncFolder) {
      // Expand ~ to home directory
      const expandedPath = syncFolder.replace(/^~/, os.homedir());
      const customPath = path.join(expandedPath, 'Alfred.alfredpreferences', 'workflows');
      if (fs.existsSync(customPath)) {
        return customPath;
      }
    }
  } catch (e) {
    // No custom sync folder, continue to default
  }
  
  // Default Alfred location
  return path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'Alfred',
    'Alfred.alfredpreferences',
    'workflows'
  );
}

const WORKFLOW_NAME = 'Portio';

// Get the Alfred workflow directory (packages/alfred-portio)
const SOURCE_DIR = path.join(path.dirname(__dirname), 'packages', 'alfred-portio');
const ALFRED_WORKFLOWS_DIR = findAlfredWorkflowsDir();
const DEST_DIR = path.join(ALFRED_WORKFLOWS_DIR, 'portio-workflow');

console.log('Portio Alfred Workflow Installer');
console.log('=================================\n');

// Check if Alfred workflows directory exists
if (!fs.existsSync(ALFRED_WORKFLOWS_DIR)) {
  console.log('Alfred workflows directory not found at:');
  console.log(`  ${ALFRED_WORKFLOWS_DIR}`);
  console.log('\nMake sure Alfred is installed and has the Powerpack enabled.');
  console.log('\nAlternative: You can manually copy this folder to your Alfred workflows directory.');
  process.exit(1);
}

// Check if destination already exists
if (fs.existsSync(DEST_DIR)) {
  const stats = fs.lstatSync(DEST_DIR);
  if (stats.isSymbolicLink()) {
    console.log('Existing symlink found. Removing...');
    fs.unlinkSync(DEST_DIR);
  } else {
    console.log('Existing workflow folder found. Removing...');
    fs.rmSync(DEST_DIR, { recursive: true });
  }
}

// Create symlink
try {
  fs.symlinkSync(SOURCE_DIR, DEST_DIR);
  console.log('✅ Successfully installed Portio workflow!\n');
  console.log('Workflow installed at:');
  console.log(`  ${DEST_DIR} -> ${SOURCE_DIR}\n`);
  console.log('Usage:');
  console.log('  1. Make sure Portio is running');
  console.log('  2. Open Alfred and type "p " to search projects');
  console.log('  3. Select a project to see available actions\n');
  console.log('Tip: You can also use keyboard shortcuts:');
  console.log('  - Cmd + Return: Open in Cursor');
  console.log('  - Alt + Return: Kill all ports');
} catch (error) {
  console.log(`❌ Failed to create symlink: ${error.message}`);
  console.log('\nTry running with sudo or manually copy this folder to:');
  console.log(`  ${ALFRED_WORKFLOWS_DIR}`);
  process.exit(1);
}

// Install npm dependencies
console.log('\n📦 Installing dependencies...');
try {
  execSync('npm install --omit=dev', { cwd: SOURCE_DIR, stdio: 'inherit' });
  console.log('✅ Dependencies installed!\n');
} catch (error) {
  console.log('⚠️  Could not install dependencies. Run "npm install" manually in:');
  console.log(`   ${SOURCE_DIR}\n`);
}

// Restart Alfred to load the new workflow
console.log('🔄 Restarting Alfred...');
try {
  execSync('osascript -e \'quit app "Alfred 5"\'', { stdio: 'ignore' });
  // Wait a moment for Alfred to fully quit
  execSync('sleep 1');
  execSync('open -a "Alfred 5"', { stdio: 'ignore' });
  console.log('✅ Alfred restarted!\n');
} catch (error) {
  console.log('⚠️  Could not restart Alfred automatically. Please restart it manually.\n');
}

console.log('🎉 Installation complete! Open Alfred and type "p " to get started.');
