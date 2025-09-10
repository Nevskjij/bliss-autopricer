#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const execAsync = promisify(exec);

class AutoPricerUpdater {
  constructor() {
    this.logDir = path.join(__dirname, '..', 'logs');
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Handle CTRL+C gracefully
    this.rl.on('SIGINT', () => {
      console.log('\n\n⚠️  Update interrupted by user');
      console.log('You can run "npm run update" again anytime.');
      process.exit(0);
    });

    this.isWindows = process.platform === 'win32';
    this.backupDir = path.join(__dirname, '..', 'backups');
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async execCommand(command, description = '') {
    try {
      console.log(`🔄 ${description || command}`);
      const result = await execAsync(command);
      if (result.stdout) {
        console.log(result.stdout);
      }
      return result;
    } catch (error) {
      console.error(`❌ Failed: ${error.message}`);
      if (error.stdout) {
        console.log(error.stdout);
      }
      if (error.stderr) {
        console.error(error.stderr);
      }
      throw error;
    }
  }

  async checkGitRepository() {
    try {
      await this.execCommand('git status', 'Checking git repository status');
      return true;
    } catch {
      console.log('⚠️  Not a git repository or git not available');
      return false;
    }
  }

  async createBackup() {
    console.log('\n💾 Creating backup...');

    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `backup-${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);

      // Files to backup
      const filesToBackup = [
        'config/pricerConfig.json',
        'config/config.json',
        'files/pricelist.json',
        'package.json',
        'package-lock.json',
      ];

      // Create backup directory
      await fs.mkdir(backupPath, { recursive: true });

      // Copy important files
      for (const file of filesToBackup) {
        const sourcePath = path.join(__dirname, '..', file);
        const destPath = path.join(backupPath, file);

        try {
          // Ensure destination directory exists
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(sourcePath, destPath);
          console.log(`✅ Backed up: ${file}`);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            console.log(`⚠️  Could not backup ${file}: ${err.message}`);
          }
        }
      }

      console.log(`📦 Backup created: ${backupPath}`);
      return backupPath;
    } catch (err) {
      console.error('❌ Backup creation failed:', err.message);
      throw err;
    }
  }

  async checkForUpdates() {
    console.log('\n🔍 Checking for updates...');

    const isGitRepo = await this.checkGitRepository();

    if (isGitRepo) {
      try {
        // Fetch latest changes
        await this.execCommand('git fetch origin', 'Fetching latest changes');

        // Check if we're behind
        const { stdout } = await this.execCommand(
          'git rev-list HEAD...origin/main --count',
          'Checking for new commits'
        );

        const commitsBehind = parseInt(stdout.trim());

        if (commitsBehind > 0) {
          console.log(`📊 ${commitsBehind} new commit(s) available`);

          // Show recent commits
          console.log('\n📋 Recent changes:');
          await this.execCommand(
            'git log HEAD..origin/main --oneline --max-count=10',
            'Showing recent commits'
          );

          return true;
        } else {
          console.log('✅ Already up to date!');
          return false;
        }
      } catch (err) {
        console.error('⚠️  Could not check git updates:', err.message);
        return false;
      }
    } else {
      console.log('⚠️  Not a git repository - manual update required');
      return false;
    }
  }

  async updateDependencies() {
    console.log('\n📦 Updating dependencies...');

    try {
      // Check if package-lock.json exists
      const hasLockfile = await fs
        .access(path.join(__dirname, '..', 'package-lock.json'))
        .then(() => true)
        .catch(() => false);

      if (hasLockfile) {
        await this.execCommand('npm ci', 'Installing exact dependencies from lockfile');
      } else {
        await this.execCommand('npm install', 'Installing latest dependencies');
      }

      console.log('✅ Dependencies updated');
    } catch (err) {
      console.error('❌ Dependency update failed:', err.message);
      throw err;
    }
  }

  async runDatabaseMigrations() {
    console.log('\n🗄️  Running database migrations...');

    try {
      // Check if there are any migration scripts
      const migrationPath = path.join(__dirname, 'sql');

      try {
        const sqlFiles = await fs.readdir(migrationPath);
        const migrationFiles = sqlFiles.filter(
          (file) => file.endsWith('.sql') && file.startsWith('update-')
        );

        if (migrationFiles.length > 0) {
          console.log(`📋 Found ${migrationFiles.length} migration(s)`);
          console.log('⚠️  Database migrations require manual review');
          console.log('Migration files found:');
          migrationFiles.forEach((file) => {
            console.log(`  • ${file}`);
          });
          console.log('\nTo apply migrations:');
          console.log('1. Review the SQL files in setup/sql/');
          console.log('2. Apply them manually to your database');
          console.log('3. Test your application');
        } else {
          console.log('✅ No migrations to run');
        }
      } catch {
        console.log('✅ No migration directory found');
      }
    } catch (err) {
      console.error('⚠️  Migration check failed:', err.message);
    }
  }
  async validateConfiguration() {
    console.log('\n⚙️  Validating configuration...');

    try {
      // Try to load and validate the configuration
      const configPath = path.join(__dirname, '..', 'config', 'pricerConfig.json');

      try {
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configContent);

        // Basic validation
        if (!config.version) {
          console.log('⚠️  No version found in config - might need migration');
        } else {
          console.log(`✅ Configuration version: ${config.version}`);
        }

        // Check if bot configurations exist
        if (config.bots && config.bots.length > 0) {
          console.log(`✅ ${config.bots.length} bot(s) configured`);
        } else {
          console.log('⚠️  No bots configured - you may need to run bot discovery');
        }
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.log('⚠️  Configuration file not found - you may need to run setup');
        } else {
          console.log('⚠️  Configuration file is invalid:', err.message);
        }
      }
    } catch (err) {
      console.error('❌ Configuration validation failed:', err.message);
    }
  }

  async performUpdate() {
    console.log('\n🚀 Performing update...');

    try {
      // Pull latest changes
      await this.execCommand('git pull origin main', 'Pulling latest changes');

      // Update dependencies
      await this.updateDependencies();

      // Run database migrations
      await this.runDatabaseMigrations();

      // Validate configuration
      await this.validateConfiguration();

      console.log('\n✅ Update completed successfully!');
    } catch (err) {
      console.error('❌ Update failed:', err.message);
      throw err;
    }
  }

  async showPostUpdateInfo() {
    console.log('\n🎉 Update Complete!');
    console.log('==================');

    console.log('\n🔄 Recommended next steps:');
    console.log('1. Review the changelog for any breaking changes');
    console.log('2. Check your configuration files');
    console.log('3. Test the application before going live');
    console.log('4. Update your bot configurations if needed');

    console.log('\n🚀 Starting the application:');
    console.log('• npm start          - Start normally');
    console.log('• npm run dev        - Start in development mode');
    console.log('• npm run setup      - Re-run setup if needed');

    console.log('\n🔗 Useful links:');
    console.log('• Documentation: ./docs/');
    console.log('• Configuration: ./pricerConfig.json');
    console.log('• Bot management: http://localhost:3000/bot-config');

    const backups = await this.listRecentBackups();
    if (backups.length > 0) {
      console.log('\n💾 Recent backups:');
      backups.slice(0, 3).forEach((backup, i) => {
        console.log(`  ${i + 1}. ${backup}`);
      });
    }
  }

  async listRecentBackups() {
    try {
      const backups = await fs.readdir(this.backupDir);
      return backups
        .filter((name) => name.startsWith('backup-'))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  async run() {
    try {
      console.log('🔄 Bliss Autopricer Updater');
      console.log('============================');
      console.log('This will update the autopricer to the latest version.\n');

      // Check for updates
      const hasUpdates = await this.checkForUpdates();

      if (!hasUpdates) {
        console.log('\n✅ No updates available');

        const forceUpdate = await this.question('Force update dependencies anyway? (y/n): ');
        if (forceUpdate.toLowerCase() !== 'y') {
          console.log('Update cancelled');
          return;
        }
      }

      // Confirm update
      const proceed = await this.question('\nProceed with update? (y/n): ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('Update cancelled');
        return;
      }

      // Create backup
      const backupPath = await this.createBackup();

      try {
        // Perform update
        await this.performUpdate();

        // Show post-update information
        await this.showPostUpdateInfo();
      } catch (updateErr) {
        console.error('\n❌ Update failed:', updateErr.message);
        console.log(`💾 Your backup is available at: ${backupPath}`);
        console.log('You can restore from backup if needed.');
        throw updateErr;
      }
    } catch (err) {
      console.error('❌ Update process failed:', err.message);
      console.log('Please check the documentation or seek help.');
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }
}

// Run updater if called directly
if (require.main === module) {
  const updater = new AutoPricerUpdater();
  updater.run();
}

module.exports = AutoPricerUpdater;
