#!/usr/bin/env node

/**
 * Universal Autopricer Setup Script
 * Works on Windows, macOS, Linux, SSH, WSL - all environments
 * Replaces install.sh, remote-setup.js, and simplifies setup.js
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const os = require('os');

const execAsync = promisify(exec);

class UniversalSetup {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Environment detection
    this.platform = process.platform;
    this.isWindows = this.platform === 'win32';
    this.isMac = this.platform === 'darwin';
    this.isLinux = this.platform === 'linux';
    this.isWSL = this.isLinux && os.release().toLowerCase().includes('microsoft');
    this.isSSH = !!(process.env.SSH_CLIENT || process.env.SSH_TTY);
    this.isRemote = this.isSSH || !!process.env.REMOTE_SESSION;

    this.config = {};
    this.setupStartTime = Date.now();
    this.logFile = path.join(__dirname, '..', 'logs', `setup-${Date.now()}.log`);

    // Ensure logs directory exists
    this.ensureLogsDir();
  }

  async ensureLogsDir() {
    try {
      await fs.mkdir(path.join(__dirname, '..', 'logs'), { recursive: true });
    } catch (err) {
      // Directory exists or can't create, continue anyway
    }
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`;

    // Log to file
    try {
      await fs.appendFile(this.logFile, logEntry);
    } catch (err) {
      // Ignore log file errors
    }

    // Log to console with colors
    const colors = {
      info: '\x1b[36m', // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m', // Red
    };

    console.log(`${colors[level] || colors.info}${message}\x1b[0m`);
  }

  async execWithLogging(command, description = '') {
    if (description) {
      await this.log(`${description}...`);
    }

    try {
      const result = await execAsync(command, { timeout: 60000 });
      await this.log(`✅ ${description || 'Command'} completed`, 'success');
      return result;
    } catch (error) {
      await this.log(`❌ ${description || 'Command'} failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async detectEnvironment() {
    await this.log('🔍 Detecting environment...', 'info');

    const env = {
      platform: this.platform,
      arch: process.arch,
      isWindows: this.isWindows,
      isMac: this.isMac,
      isLinux: this.isLinux,
      isWSL: this.isWSL,
      isSSH: this.isSSH,
      isRemote: this.isRemote,
      user: process.env.USER || process.env.USERNAME,
      home: os.homedir(),
      nodeVersion: process.version,
    };

    await this.log(`Platform: ${env.platform} (${env.arch})`);
    await this.log(`User: ${env.user}`);
    await this.log(`Node.js: ${env.nodeVersion}`);

    if (env.isWSL) await this.log('🐧 WSL environment detected');
    if (env.isSSH) await this.log('🔗 SSH session detected');
    if (env.isRemote) await this.log('📡 Remote session detected');

    return env;
  }

  async validateDirectory() {
    const currentDir = process.cwd();
    await this.log(`Current directory: ${currentDir}`);

    // Check if we're in a bot directory (common mistake)
    const suspiciousPaths = ['tf2autobot', 'autobot', '/bot/', '\\bot\\'];
    const inBotDir = suspiciousPaths.some((suspicious) =>
      currentDir.toLowerCase().includes(suspicious.toLowerCase())
    );

    if (inBotDir) {
      await this.log('⚠️  WARNING: You appear to be in a bot directory!', 'warning');
      console.log('\n⚠️  WARNING: Installing in a bot directory!');
      console.log('🔄 The autopricer should be in its own separate directory.');
      console.log('\n✅ Recommended directories:');
      if (this.isWindows) {
        console.log('  - C:\\autopricer\\');
        console.log('  - %USERPROFILE%\\autopricer\\');
      } else {
        console.log('  - ~/autopricer/');
        console.log('  - /opt/autopricer/');
      }

      const proceed = await this.question('\nContinue anyway? (NOT recommended) (y/n): ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('\n📝 To fix this:');
        if (this.isWindows) {
          console.log('1. Create directory: mkdir C:\\autopricer');
          console.log('2. Navigate to it: cd C:\\autopricer');
        } else {
          console.log('1. Create directory: mkdir ~/autopricer');
          console.log('2. Navigate to it: cd ~/autopricer');
        }
        console.log('3. Copy autopricer files there');
        console.log('4. Run setup again');
        process.exit(1);
      }
    }

    // Check if package.json exists
    try {
      await fs.access('package.json');
      await this.log('✅ Found package.json', 'success');
    } catch (err) {
      await this.log('❌ package.json not found. Are you in the autopricer directory?', 'error');
      throw new Error('package.json not found. Please run setup from the autopricer directory.');
    }
  }

  async checkNodeVersion() {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

    if (majorVersion < 22) {
      await this.log(`❌ Node.js ${nodeVersion} is too old (need v22+)`, 'error');
      console.log('\n❌ Node.js version is too old');
      console.log('Please install Node.js 22 or later:');
      if (this.isWindows) {
        console.log('• Download from: https://nodejs.org/');
        console.log('• Or use winget: winget install OpenJS.NodeJS');
      } else if (this.isMac) {
        console.log('• Use Homebrew: brew install node');
        console.log('• Or download from: https://nodejs.org/');
      } else {
        console.log('• Use package manager: sudo apt install nodejs npm');
        console.log(
          '• Or use NodeSource: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -'
        );
      }
      throw new Error('Node.js version too old');
    }

    await this.log(`✅ Node.js ${nodeVersion} is supported`, 'success');
  }

  async detectPostgreSQL() {
    await this.log('🔍 Checking PostgreSQL installation...', 'info');

    // Try standard commands first
    const commands = ['psql', 'pg_config', 'postgres'];
    let postgresFound = false;

    for (const cmd of commands) {
      try {
        await this.execWithLogging(`${cmd} --version`, `Testing ${cmd} command`);
        postgresFound = true;
        await this.log(`✅ PostgreSQL found via ${cmd}`, 'success');
        break;
      } catch (err) {
        // Command not found, try next
      }
    }

    // Windows-specific PostgreSQL detection
    if (!postgresFound && this.isWindows) {
      await this.log('Searching Windows PostgreSQL installations...', 'info');
      const windowsPaths = [
        'C:\\Program Files\\PostgreSQL',
        'C:\\Program Files (x86)\\PostgreSQL',
        process.env.PROGRAMFILES + '\\PostgreSQL',
        process.env['PROGRAMFILES(X86)'] + '\\PostgreSQL',
      ];

      for (const basePath of windowsPaths) {
        try {
          const versions = await fs.readdir(basePath);
          for (const version of versions.reverse()) {
            const psqlPath = path.join(basePath, version, 'bin', 'psql.exe');
            try {
              await fs.access(psqlPath);
              await this.execWithLogging(`"${psqlPath}" --version`, 'Testing PostgreSQL');
              this.psqlPath = psqlPath;
              postgresFound = true;
              await this.log(`✅ Found PostgreSQL at ${basePath}\\${version}`, 'success');
              break;
            } catch (err) {
              // This version doesn't work, try next
            }
          }
          if (postgresFound) break;
        } catch (err) {
          // Directory doesn't exist
        }
      }
    }

    return { found: postgresFound, psqlPath: this.psqlPath };
  }

  async installPostgreSQL() {
    await this.log('📦 Installing PostgreSQL...', 'info');

    if (this.isWindows) {
      const managers = [
        { name: 'winget', cmd: 'winget install PostgreSQL.PostgreSQL' },
        { name: 'chocolatey', cmd: 'choco install postgresql -y' },
        { name: 'scoop', cmd: 'scoop install postgresql' },
      ];

      for (const manager of managers) {
        try {
          await this.execWithLogging(`${manager.name} --version`, `Checking ${manager.name}`);
          await this.execWithLogging(manager.cmd, `Installing PostgreSQL via ${manager.name}`);
          await this.log(`✅ PostgreSQL installed via ${manager.name}`, 'success');
          return;
        } catch (err) {
          // Manager not available or failed
        }
      }

      // Manual installation needed
      await this.log('❌ No package manager found for automatic installation', 'error');
      console.log('\n❌ Please install PostgreSQL manually:');
      console.log('1. Download from: https://www.postgresql.org/download/windows/');
      console.log('2. Run the installer');
      console.log('3. Remember the postgres user password');
      console.log('4. Run this setup again');
      throw new Error('Manual PostgreSQL installation required');
    } else if (this.isMac) {
      try {
        await this.execWithLogging('brew --version', 'Checking Homebrew');
        await this.execWithLogging('brew install postgresql@16', 'Installing PostgreSQL');
        await this.execWithLogging('brew services start postgresql@16', 'Starting PostgreSQL');
        await this.log('✅ PostgreSQL installed and started', 'success');
      } catch (err) {
        console.log('\n❌ Please install PostgreSQL manually:');
        console.log(
          '1. Install Homebrew: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        );
        console.log('2. Install PostgreSQL: brew install postgresql@16');
        console.log('3. Start service: brew services start postgresql@16');
        throw err;
      }
    } else if (this.isLinux) {
      try {
        // Detect Linux distribution
        const osRelease = await fs.readFile('/etc/os-release', 'utf8');

        if (osRelease.includes('Ubuntu') || osRelease.includes('Debian')) {
          await this.execWithLogging('sudo apt update', 'Updating package list');
          await this.execWithLogging(
            'sudo apt install -y postgresql postgresql-contrib',
            'Installing PostgreSQL'
          );
          await this.execWithLogging('sudo systemctl start postgresql', 'Starting PostgreSQL');
          await this.execWithLogging('sudo systemctl enable postgresql', 'Enabling PostgreSQL');
        } else if (osRelease.includes('CentOS') || osRelease.includes('Red Hat')) {
          await this.execWithLogging(
            'sudo yum install -y postgresql-server postgresql-contrib',
            'Installing PostgreSQL'
          );
          await this.execWithLogging('sudo postgresql-setup initdb', 'Initializing PostgreSQL');
          await this.execWithLogging('sudo systemctl start postgresql', 'Starting PostgreSQL');
          await this.execWithLogging('sudo systemctl enable postgresql', 'Enabling PostgreSQL');
        } else {
          throw new Error('Unsupported Linux distribution');
        }
        await this.log('✅ PostgreSQL installed and started', 'success');
      } catch (err) {
        console.log('\n❌ Please install PostgreSQL manually:');
        console.log('sudo apt update && sudo apt install postgresql postgresql-contrib');
        console.log('sudo systemctl start postgresql && sudo systemctl enable postgresql');
        throw err;
      }
    }
  }

  async fixPostgreSQLAuth() {
    if (!this.isLinux) {
      return; // Only needed on Linux
    }

    await this.log('🔐 Fixing PostgreSQL authentication...', 'info');

    try {
      // Find pg_hba.conf
      const { stdout } = await this.execWithLogging(
        'sudo find /etc -name "pg_hba.conf" 2>/dev/null | head -1',
        'Finding PostgreSQL config'
      );

      const configPath = stdout.trim();
      if (!configPath) {
        await this.log('⚠️  Could not find pg_hba.conf automatically', 'warning');
        return false;
      }

      await this.log(`Found pg_hba.conf at: ${configPath}`);

      // Backup original
      await this.execWithLogging(
        `sudo cp "${configPath}" "${configPath}.backup.${Date.now()}"`,
        'Creating backup'
      );

      // Fix authentication
      await this.execWithLogging(
        `sudo sed -i 's/local   all             all                                     peer/local   all             all                                     md5/' "${configPath}"`,
        'Updating authentication method'
      );

      // Restart PostgreSQL
      await this.execWithLogging('sudo systemctl restart postgresql', 'Restarting PostgreSQL');
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for restart

      await this.log('✅ PostgreSQL authentication fixed', 'success');
      return true;
    } catch (err) {
      await this.log(`⚠️  Could not fix PostgreSQL auth automatically: ${err.message}`, 'warning');
      return false;
    }
  }

  async setupDatabase() {
    await this.log('🗄️  Setting up database...', 'info');

    // Generate secure credentials
    const dbConfig = {
      host: 'localhost',
      port: 5432,
      database: 'tf2autopricer',
      user: 'autopricer',
      password: this.generateSecurePassword(),
    };

    console.log('\n🔑 Database Configuration:');
    console.log(`   Database: ${dbConfig.database}`);
    console.log(`   User: ${dbConfig.user}`);
    console.log(`   Password: ${dbConfig.password}`);

    const useDefaults = await this.question('\nUse these settings? (y/n): ');
    if (useDefaults.toLowerCase() !== 'y') {
      dbConfig.database =
        (await this.question('Database name (tf2autopricer): ')) || dbConfig.database;
      dbConfig.user = (await this.question('Database user (autopricer): ')) || dbConfig.user;
      dbConfig.password = (await this.question('Database password: ')) || dbConfig.password;
    }

    // Try different authentication methods
    const authMethods = [];

    if (this.isWindows) {
      authMethods.push(
        { method: 'Windows Authentication', cmd: 'psql -U postgres' },
        { method: 'Local postgres', cmd: 'psql -d postgres' }
      );
    } else {
      authMethods.push(
        { method: 'sudo postgres', cmd: 'sudo -u postgres psql' },
        { method: 'postgres user', cmd: 'psql -U postgres' },
        { method: 'current user', cmd: 'psql -d postgres' }
      );
    }

    let workingAuth = null;
    for (const auth of authMethods) {
      try {
        await this.log(`Trying ${auth.method}...`);
        const psqlCmd = this.psqlPath ? `"${this.psqlPath}"` : auth.cmd.split(' ')[0];
        const fullCmd = this.psqlPath
          ? `${psqlCmd} -U postgres -c "SELECT 1;"`
          : `${auth.cmd} -c "SELECT 1;"`;

        await this.execWithLogging(fullCmd, `Testing ${auth.method}`);
        workingAuth = auth;
        await this.log(`✅ Connected with ${auth.method}`, 'success');
        break;
      } catch (err) {
        await this.log(`❌ ${auth.method} failed`, 'warning');
      }
    }

    if (!workingAuth) {
      await this.log('❌ Could not connect to PostgreSQL automatically', 'error');
      console.log('\n❌ Manual database setup required:');
      console.log('1. Connect as postgres user:');
      if (this.isWindows) {
        console.log('   psql -U postgres');
      } else {
        console.log('   sudo -u postgres psql');
      }
      console.log('2. Run these commands:');
      console.log(`   CREATE USER ${dbConfig.user} WITH PASSWORD '${dbConfig.password}';`);
      console.log(`   CREATE DATABASE ${dbConfig.database} OWNER ${dbConfig.user};`);
      console.log(`   GRANT ALL PRIVILEGES ON DATABASE ${dbConfig.database} TO ${dbConfig.user};`);
      console.log('   \\q');

      const manual = await this.question('\nHave you completed the manual setup? (y/n): ');
      if (manual.toLowerCase() !== 'y') {
        throw new Error('Database setup incomplete');
      }
    } else {
      // Automated setup
      const setupSQL = `
        DO \\$\\$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${dbConfig.user}') THEN
            CREATE USER ${dbConfig.user} WITH PASSWORD '${dbConfig.password.replace(/'/g, "''")}';
          END IF;
        END
        \\$\\$;
        
        SELECT 'CREATE DATABASE ${dbConfig.database} OWNER ${dbConfig.user}'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${dbConfig.database}')\\\\gexec;
        
        GRANT ALL PRIVILEGES ON DATABASE ${dbConfig.database} TO ${dbConfig.user};
      `;

      try {
        const psqlCmd = this.psqlPath ? `"${this.psqlPath}"` : workingAuth.cmd.split(' ')[0];
        const connectCmd = this.psqlPath ? `${psqlCmd} -U postgres` : workingAuth.cmd;

        // Write SQL to a temporary file to avoid shell escaping issues
        const tempSqlFile = path.join(os.tmpdir(), `autopricer-setup-${Date.now()}.sql`);
        await fs.writeFile(tempSqlFile, setupSQL);

        try {
          await this.execWithLogging(
            `${connectCmd} -f "${tempSqlFile}"`,
            'Creating database and user'
          );
          await this.log('✅ Database created successfully', 'success');
        } finally {
          // Clean up temp file
          try {
            await fs.unlink(tempSqlFile);
          } catch {
            // Ignore clean up errors
          }
        }
      } catch (err) {
        if (err.message.includes('already exists')) {
          await this.log('Database/user already exists, continuing...', 'warning');
        } else {
          throw err;
        }
      }
    }

    // Test connection
    try {
      const testCmd = this.psqlPath
        ? `set PGPASSWORD=${dbConfig.password} && "${this.psqlPath}" -U ${dbConfig.user} -h ${dbConfig.host} -d ${dbConfig.database} -c "SELECT 1;"`
        : `PGPASSWORD="${dbConfig.password}" psql -U ${dbConfig.user} -h ${dbConfig.host} -d ${dbConfig.database} -c "SELECT 1;"`;

      await this.execWithLogging(testCmd, 'Testing database connection');
      await this.log('✅ Database connection successful', 'success');
    } catch (error) {
      await this.log(`❌ Database connection test failed: ${error.message}`, 'error');
      console.log('❌ Database connection failed. Please verify credentials manually.');
    }

    this.config.database = dbConfig;
    return dbConfig;
  }

  generateSecurePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  async findBotDirectories() {
    await this.log('🔍 Searching for bot directories...', 'info');

    const botPaths = [];
    const searchPaths = this.isWindows
      ? [
          path.join(os.homedir(), 'tf2autobot'),
          path.join(os.homedir(), 'bots'),
          'C:\\tf2autobot',
          'C:\\bots',
        ]
      : [
          path.join(os.homedir(), 'tf2autobot'),
          path.join(os.homedir(), 'autobot'),
          path.join(os.homedir(), 'bots'),
          '/opt/tf2autobot',
          '/opt/bots',
        ];

    for (const searchPath of searchPaths) {
      try {
        await fs.access(searchPath);
        botPaths.push(searchPath);
        await this.log(`✅ Found: ${searchPath}`, 'success');
      } catch {
        // Directory doesn't exist
      }
    }

    if (botPaths.length === 0) {
      await this.log('No bot directories found automatically', 'warning');
    }

    // Allow manual path entry
    const addManual = await this.question('Add additional bot paths? (y/n): ');
    if (addManual.toLowerCase() === 'y') {
      console.log('\nEnter bot paths (press Enter on empty line to finish):');
      while (true) {
        const botPath = await this.question('Bot path: ');
        if (!botPath.trim()) {
          break;
        }

        try {
          await fs.access(botPath);
          botPaths.push(botPath);
          await this.log(`✅ Added: ${botPath}`, 'success');
        } catch {
          const add = await this.question('Path not found. Add anyway? (y/n): ');
          if (add.toLowerCase() === 'y') {
            botPaths.push(botPath);
          }
        }
      }
    }

    this.config.botPaths = botPaths;
    return botPaths;
  }

  async installDependencies() {
    await this.log('📦 Installing dependencies...', 'info');
    try {
      await this.execWithLogging('npm install', 'Installing npm packages');
      await this.log('✅ Dependencies installed', 'success');
    } catch (err) {
      await this.log(`❌ Failed to install dependencies: ${err.message}`, 'error');
      throw new Error('Dependency installation failed');
    }
  }

  async createConfiguration() {
    await this.log('📄 Creating configuration files...', 'info');

    // Ensure directories exist
    const dirs = ['config', 'data', 'logs'];
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Create main configuration
    const config = {
      port: 3000,
      database: this.config.database,
      botPaths: this.config.botPaths || [],
      setupCompleted: true,
      setupDate: new Date().toISOString(),
      setupMethod: 'universal-setup',
      environment: {
        platform: this.platform,
        isWindows: this.isWindows,
        isSSH: this.isSSH,
        isWSL: this.isWSL,
        isRemote: this.isRemote,
      },
    };

    await fs.writeFile(path.join('config', 'pricerConfig.json'), JSON.stringify(config, null, 2));

    await this.log('✅ Configuration files created', 'success');
    return config;
  }

  async showFinalInstructions() {
    const setupDuration = ((Date.now() - this.setupStartTime) / 1000).toFixed(1);

    console.log('\n🎉 Autopricer Setup Complete!');
    console.log('===============================');

    console.log('\n✅ What was configured:');
    console.log(
      `   • Platform: ${this.platform}${this.isWSL ? ' (WSL)' : ''}${this.isSSH ? ' (SSH)' : ''}`
    );
    console.log(`   • Database: ${this.config.database.database}@${this.config.database.host}`);
    console.log(`   • User: ${this.config.database.user}`);
    console.log(`   • Bot paths: ${this.config.botPaths?.length || 0} directories`);
    console.log(`   • Setup time: ${setupDuration} seconds`);

    console.log('\n🚀 Next Steps:');
    console.log('1. Configure API keys in your bot config.json files:');
    console.log('   • Backpack.tf: https://backpack.tf/api/register');
    console.log('   • Steam: https://steamcommunity.com/dev/apikey');
    console.log('');
    console.log('2. Start the autopricer:');
    if (this.isSSH || this.isRemote) {
      console.log('   screen -S autopricer  # For persistent session');
      console.log('   npm start');
      console.log('   # Press Ctrl+A, D to detach');
    } else {
      console.log('   npm start');
    }
    console.log('');
    console.log('3. Access web interface:');
    if (this.isSSH) {
      console.log('   🔗 SSH Tunnel: ssh -L 3000:localhost:3000 user@server');
      console.log('   🌐 Then visit: http://localhost:3000');
    } else {
      console.log('   🌐 http://localhost:3000');
    }

    console.log('\n🔧 Bot Manager Integration:');
    console.log('   • Webhook URL: http://localhost:3000/api/webhook/{steamid}');
    console.log('   • Bot directories to add:');
    this.config.botPaths.forEach((path) => {
      console.log(`     - ${path}`);
    });

    console.log('\n📚 Documentation:');
    console.log('   • Configuration: docs/CONFIGURATION.md');
    console.log('   • Troubleshooting: docs/TROUBLESHOOTING.md');
    console.log(`   • Setup log: ${this.logFile}`);

    if (this.isSSH || this.isRemote) {
      console.log('\n🔗 SSH/Remote Tips:');
      console.log('   • Use screen/tmux for persistent sessions');
      console.log('   • Setup SSH key authentication for security');
      console.log('   • Consider firewall rules for port 3000');
    }

    await this.log('Setup completed successfully', 'success');
  }

  async run() {
    try {
      console.log('🚀 Bliss Autopricer Universal Setup');
      console.log('====================================');

      await this.detectEnvironment();
      await this.validateDirectory();
      await this.checkNodeVersion();

      const postgres = await this.detectPostgreSQL();
      if (!postgres.found) {
        const install = await this.question('PostgreSQL not found. Install it? (y/n): ');
        if (install.toLowerCase() === 'y') {
          await this.installPostgreSQL();
        } else {
          throw new Error('PostgreSQL is required');
        }
      }

      if (this.isLinux) {
        await this.fixPostgreSQLAuth();
      }

      await this.setupDatabase();
      await this.findBotDirectories();
      await this.installDependencies();
      await this.createConfiguration();
      await this.showFinalInstructions();
    } catch (err) {
      await this.log(`❌ Setup failed: ${err.message}`, 'error');
      console.error('\n❌ Setup failed:', err.message);
      console.log(`📋 Check the log file: ${this.logFile}`);
      console.log('For help, see docs/TROUBLESHOOTING.md');
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }
}

// Run if called directly
if (require.main === module) {
  const setup = new UniversalSetup();
  setup.run().catch(console.error);
}

module.exports = UniversalSetup;
