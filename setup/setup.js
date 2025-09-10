#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const execAsync = promisify(exec);

class SetupLogger {
  constructor(logDir) {
    this.logDir = logDir;
    this.logFile = path.join(logDir, `setup-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    this.setupStartTime = new Date();
  }

  async ensureLogDir() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (err) {
      console.warn('Could not create log directory:', err.message);
    }
  }

  async log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
    };

    const logLine = `[${timestamp}] ${level.toUpperCase()}: ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;

    // Log to console
    const levelColors = {
      info: '\x1b[36m', // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m', // Red
      debug: '\x1b[37m', // White
    };
    const color = levelColors[level] || '\x1b[37m';
    console.log(`${color}${message}\x1b[0m`);

    // Log to file
    try {
      await fs.appendFile(this.logFile, logLine);
    } catch (err) {
      console.warn('Could not write to log file:', err.message);
    }
  }

  async info(message, data) {
    await this.log('info', message, data);
  }

  async success(message, data) {
    await this.log('success', message, data);
  }

  async warning(message, data) {
    await this.log('warning', message, data);
  }

  async error(message, data) {
    await this.log('error', message, data);
  }

  async debug(message, data) {
    await this.log('debug', message, data);
  }

  async logSystemInfo() {
    const systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      workingDirectory: process.cwd(),
      environment: process.env.NODE_ENV || 'development',
      timestamp: this.setupStartTime.toISOString(),
    };

    await this.info('System Information', systemInfo);
  }

  async logCommandExecution(command, result) {
    await this.debug(`Command executed: ${command}`, {
      command,
      success: !result.error,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error?.message,
    });
  }

  getLogFile() {
    return this.logFile;
  }
}

class AutoPricerSetup {
  constructor() {
    // Setup logging
    this.logDir = path.join(__dirname, '..', 'logs');
    this.logger = new SetupLogger(this.logDir);

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Handle CTRL+C gracefully
    this.rl.on('SIGINT', async () => {
      await this.logger.warning('Setup interrupted by user (CTRL+C)');
      console.log('\n\n⚠️  Setup interrupted by user');
      console.log('You can run "npm run setup" again anytime.');
      console.log(`📋 Setup log saved to: ${this.logger.getLogFile()}`);
      process.exit(0);
    });

    this.config = {};
    this.isWindows = process.platform === 'win32';
    this.isMac = process.platform === 'darwin';
    this.isLinux = process.platform === 'linux';
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async execWithLogging(command, description = '') {
    try {
      await this.logger.debug(`Executing: ${command}`, { description });
      const result = await execAsync(command);
      await this.logger.logCommandExecution(command, result);
      return result;
    } catch (error) {
      await this.logger.logCommandExecution(command, { error });
      throw error;
    }
  }

  async checkCommand(command) {
    try {
      await this.execWithLogging(`${command} --version`, `Checking if ${command} is available`);
      return true;
    } catch {
      return false;
    }
  }

  async findPostgreSQLWindows() {
    await this.logger.info('Scanning for PostgreSQL installations on Windows');

    // Common PostgreSQL installation paths on Windows
    const commonPaths = [
      'C:\\Program Files\\PostgreSQL',
      'C:\\Program Files (x86)\\PostgreSQL',
      'C:\\PostgreSQL',
      process.env.PROGRAMFILES + '\\PostgreSQL',
      process.env['PROGRAMFILES(X86)'] + '\\PostgreSQL',
    ];

    for (const basePath of commonPaths) {
      try {
        const versions = await fs.readdir(basePath);
        await this.logger.debug(`Found PostgreSQL versions at ${basePath}`, { versions });

        for (const version of versions.reverse()) {
          // Check for the most recent version first
          const binPath = path.join(basePath, version, 'bin');
          const psqlPath = path.join(binPath, 'psql.exe');

          try {
            await fs.access(psqlPath);
            await this.logger.info(`PostgreSQL found at: ${basePath}\\${version}`);

            // Test if psql works from this location
            try {
              await this.execWithLogging(
                `"${psqlPath}" --version`,
                'Testing PostgreSQL functionality'
              );
              await this.logger.success('PostgreSQL installation verified', {
                version,
                binPath,
                psqlPath,
              });
              return { found: true, version, binPath, psqlPath };
            } catch {
              await this.logger.warning(
                `Found PostgreSQL at ${basePath}\\${version} but psql doesn't work`
              );
            }
          } catch {
            // psql.exe not found in this bin directory
            await this.logger.debug(`psql.exe not found in ${binPath}`);
          }
        }
      } catch {
        // Directory doesn't exist or can't be read
        await this.logger.debug(`Path not accessible: ${basePath}`);
      }
    }

    await this.logger.warning('No working PostgreSQL installation found on Windows');
    return { found: false };
  }

  async checkPostgreSQL() {
    await this.logger.info('Checking PostgreSQL installation');

    // First try standard command detection
    const commands = ['psql', 'pg_config', 'postgres'];
    let postgresInstalled = false;
    let postgresInfo = null;

    for (const cmd of commands) {
      if (await this.checkCommand(cmd)) {
        postgresInstalled = true;
        await this.logger.success(`PostgreSQL found (${cmd} available in PATH)`);
        break;
      }
    }

    // If not found via PATH, try Windows-specific detection
    if (!postgresInstalled && this.isWindows) {
      await this.logger.info(
        'PostgreSQL not in PATH, checking common Windows installation locations'
      );
      postgresInfo = await this.findPostgreSQLWindows();

      if (postgresInfo.found) {
        postgresInstalled = true;
        await this.logger.warning('PostgreSQL is installed but not in your system PATH');

        const addToPath = await this.question(
          'Would you like to add PostgreSQL to your PATH? (y/n): '
        );
        await this.logger.info('User PATH choice', { addToPath });

        if (addToPath.toLowerCase() === 'y' || addToPath.toLowerCase() === 'yes') {
          await this.addPostgresToPath(postgresInfo.binPath);
        } else {
          await this.logger.info('User chose not to add PostgreSQL to PATH');
          console.log('📝 Note: You can manually add this to your PATH later:');
          console.log(`   ${postgresInfo.binPath}`);
          console.log('💡 The setup will continue using the full path to psql.');

          // Store the full psql path for later use
          this.psqlPath = postgresInfo.psqlPath;
        }
      }
    }

    if (!postgresInstalled) {
      await this.logger.error('PostgreSQL not found on system');
      const install = await this.question('Would you like to install PostgreSQL? (y/n): ');
      await this.logger.info('User installation choice', { install });

      if (install.toLowerCase() === 'y' || install.toLowerCase() === 'yes') {
        await this.installPostgreSQL();
      } else {
        await this.logger.error('User declined PostgreSQL installation - setup cannot continue');
        console.log('⚠️  PostgreSQL is required. Please install it manually and run setup again.');
        process.exit(1);
      }
    }

    return postgresInstalled;
  }

  async addPostgresToPath(binPath) {
    if (this.isWindows) {
      await this.logger.info('Attempting to add PostgreSQL to system PATH', { binPath });
      console.log('📝 Adding PostgreSQL to your PATH...');
      console.log('⚠️  This requires administrator privileges and will modify your system PATH.');

      const proceed = await this.question('Do you want to proceed? (y/n): ');
      await this.logger.info('User PATH modification choice', { proceed });

      if (proceed.toLowerCase() === 'y' || proceed.toLowerCase() === 'yes') {
        try {
          // Use PowerShell to add to system PATH
          const psCommand = `[Environment]::SetEnvironmentVariable('PATH', $env:PATH + ';${binPath}', 'Machine')`;
          await this.execWithLogging(`powershell -Command "${psCommand}"`, 'Adding to system PATH');

          console.log('✅ PostgreSQL added to system PATH');
          console.log('📝 Note: You may need to restart your terminal for changes to take effect.');
          await this.logger.success('PostgreSQL successfully added to system PATH');

          // Also add to current session
          process.env.PATH += `;${binPath}`;
        } catch (err) {
          await this.logger.error('Failed to add PostgreSQL to PATH automatically', {
            error: err.message,
            binPath,
          });
          console.log('❌ Failed to add to PATH automatically:', err.message);
          console.log('📝 You can manually add this to your PATH:');
          console.log(`   ${binPath}`);
          console.log('💡 Or run this PowerShell command as administrator:');
          console.log(
            `   [Environment]::SetEnvironmentVariable('PATH', $env:PATH + ';${binPath}', 'Machine')`
          );

          // Still add to current session so the setup can continue
          console.log('📝 Adding to current session for this setup...');
          process.env.PATH += `;${binPath}`;
          this.psqlPath = null; // Clear since we added to session PATH
          await this.logger.info('Added PostgreSQL to current session PATH for setup continuation');
        }
      }
    }
  }

  getPsqlCommand() {
    // Return the appropriate psql command based on what we found
    return this.psqlPath ? `"${this.psqlPath}"` : 'psql';
  }

  async installPostgreSQL() {
    await this.logger.info('Starting PostgreSQL installation');
    console.log('\n📦 Installing PostgreSQL...');

    try {
      if (this.isWindows) {
        // Check for package managers
        if (await this.checkCommand('scoop')) {
          console.log('Installing via Scoop...');
          await this.execWithLogging('scoop install postgresql', 'Installing PostgreSQL via Scoop');
        } else if (await this.checkCommand('choco')) {
          console.log('Installing via Chocolatey...');
          await this.execWithLogging(
            'choco install postgresql -y',
            'Installing PostgreSQL via Chocolatey'
          );
        } else if (await this.checkCommand('winget')) {
          console.log('Installing via Winget...');
          await this.execWithLogging(
            'winget install PostgreSQL.PostgreSQL',
            'Installing PostgreSQL via Winget'
          );
        } else {
          await this.logger.error('No package manager found on Windows');
          console.log('❌ No package manager found. Please install PostgreSQL manually:');
          console.log('https://www.postgresql.org/download/windows/');
          process.exit(1);
        }
      } else if (this.isMac) {
        if (await this.checkCommand('brew')) {
          console.log('Installing via Homebrew...');
          await this.execWithLogging(
            'brew install postgresql@16',
            'Installing PostgreSQL via Homebrew'
          );
          await this.execWithLogging(
            'brew services start postgresql@16',
            'Starting PostgreSQL service'
          );
        } else {
          await this.logger.error('Homebrew not found on macOS');
          console.log('❌ Homebrew not found. Please install PostgreSQL manually:');
          console.log('https://www.postgresql.org/download/macosx/');
          process.exit(1);
        }
      } else if (this.isLinux) {
        // Detect Linux distribution
        try {
          const { stdout } = await this.execWithLogging(
            'cat /etc/os-release',
            'Detecting Linux distribution'
          );
          if (stdout.includes('Ubuntu') || stdout.includes('Debian')) {
            console.log('Installing on Ubuntu/Debian...');
            await this.execWithLogging('sudo apt update', 'Updating package list');
            await this.execWithLogging(
              'sudo apt install -y postgresql postgresql-contrib',
              'Installing PostgreSQL'
            );
            await this.execWithLogging(
              'sudo systemctl start postgresql',
              'Starting PostgreSQL service'
            );
            await this.execWithLogging(
              'sudo systemctl enable postgresql',
              'Enabling PostgreSQL service'
            );
          } else if (stdout.includes('CentOS') || stdout.includes('Red Hat')) {
            console.log('Installing on CentOS/RHEL...');
            await this.execWithLogging(
              'sudo yum install -y postgresql-server postgresql-contrib',
              'Installing PostgreSQL'
            );
            await this.execWithLogging('sudo postgresql-setup initdb', 'Initializing PostgreSQL');
            await this.execWithLogging(
              'sudo systemctl start postgresql',
              'Starting PostgreSQL service'
            );
            await this.execWithLogging(
              'sudo systemctl enable postgresql',
              'Enabling PostgreSQL service'
            );
          } else {
            await this.logger.error('Unsupported Linux distribution', { stdout });
            console.log('❌ Unsupported Linux distribution. Please install PostgreSQL manually.');
            process.exit(1);
          }
        } catch (err) {
          await this.logger.error('Could not detect Linux distribution', { error: err.message });
          console.log('❌ Could not detect Linux distribution:', err.message);
          process.exit(1);
        }
      }

      await this.logger.success('PostgreSQL installation completed');
      console.log('✅ PostgreSQL installation completed');

      // Wait a moment for service to start
      console.log('⏳ Waiting for PostgreSQL to start...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (err) {
      await this.logger.error('PostgreSQL installation failed', { error: err.message });
      console.log('❌ PostgreSQL installation failed:', err.message);
      console.log('Please install PostgreSQL manually and run setup again.');
      process.exit(1);
    }
  }

  async setupDatabase() {
    await this.logger.info('Starting database setup');
    console.log('\n🗄️  Setting up database...');

    // Get database configuration
    console.log('\nDatabase Configuration:');
    const dbHost = (await this.question('Database host (localhost): ')) || 'localhost';
    const dbPort = (await this.question('Database port (5432): ')) || '5432';
    const dbName = (await this.question('Database name (tf2autopricer): ')) || 'tf2autopricer';
    const dbUser = (await this.question('Database user (autopricer): ')) || 'autopricer';

    // Generate a random password if not provided
    let dbPassword = await this.question('Database password (leave empty to generate): ');
    if (!dbPassword) {
      dbPassword = Math.random().toString(36).slice(-16);
      console.log(`🔑 Generated password: ${dbPassword}`);
    }

    this.config.database = {
      host: dbHost,
      port: parseInt(dbPort),
      database: dbName,
      user: dbUser,
      password: dbPassword,
    };

    await this.logger.info('Database configuration collected', {
      host: dbHost,
      port: dbPort,
      database: dbName,
      user: dbUser,
      // Don't log the actual password
      passwordGenerated: !dbPassword,
    });

    // Create database and user
    try {
      console.log('\n📝 Creating database and user...');

      // Check if we can connect as postgres user
      let adminUser = 'postgres';
      let adminConnected = false;

      // Try different admin users
      const adminUsers = ['postgres', process.env.USER, 'root'];
      for (const user of adminUsers) {
        try {
          const psqlCmd = this.getPsqlCommand();
          await this.execWithLogging(
            `${psqlCmd} -U ${user} -d postgres -c "SELECT 1;" 2>/dev/null`,
            `Testing connection as ${user}`
          );
          adminUser = user;
          adminConnected = true;
          await this.logger.success(`Connected as admin user: ${adminUser}`);
          break;
        } catch {
          // Try next user
          await this.logger.debug(`Could not connect as ${user}`);
        }
      }

      if (!adminConnected) {
        await this.logger.error('Could not connect to PostgreSQL as any admin user');
        console.log('❌ Could not connect to PostgreSQL as admin');
        console.log('Please ensure PostgreSQL is running and you have admin access');

        const manual = await this.question('Continue with manual database setup? (y/n): ');
        if (manual.toLowerCase() !== 'y') {
          process.exit(1);
        }

        console.log('\n📋 Manual setup instructions:');
        console.log(`1. Connect to PostgreSQL: psql -U postgres`);
        console.log(`2. Create user: CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}';`);
        console.log(`3. Create database: CREATE DATABASE ${dbName} OWNER ${dbUser};`);
        console.log(
          `4. Grant permissions: GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};`
        );
        console.log(`5. Connect to database: \\c ${dbName}`);
        console.log(`6. Create schema: CREATE SCHEMA tf2;`);
        console.log(
          `7. Grant schema permissions: GRANT ALL PRIVILEGES ON SCHEMA tf2 TO ${dbUser};`
        );

        const completed = await this.question('\nHave you completed the manual setup? (y/n): ');
        if (completed.toLowerCase() !== 'y') {
          process.exit(1);
        }
      } else {
        // Automated setup
        const setupSQL = `
          -- Create user if not exists
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${dbUser}') THEN
              CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}';
            END IF;
          END
          $$;
          
          -- Create database if not exists
          SELECT 'CREATE DATABASE ${dbName} OWNER ${dbUser}'
          WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${dbName}')\\gexec
          
          -- Grant database privileges
          GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};
        `;

        await this.execWithLogging(
          `${this.getPsqlCommand()} -U ${adminUser} -d postgres -c "${setupSQL}"`,
          'Creating database and user'
        );

        const schemaSQL = `
          -- Create schema and grant permissions
          CREATE SCHEMA IF NOT EXISTS tf2;
          GRANT ALL PRIVILEGES ON SCHEMA tf2 TO ${dbUser};
          GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA tf2 TO ${dbUser};
          GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA tf2 TO ${dbUser};
          ALTER DEFAULT PRIVILEGES IN SCHEMA tf2 GRANT ALL ON TABLES TO ${dbUser};
          ALTER DEFAULT PRIVILEGES IN SCHEMA tf2 GRANT ALL ON SEQUENCES TO ${dbUser};
        `;

        await this.execWithLogging(
          `${this.getPsqlCommand()} -U ${adminUser} -d ${dbName} -c "${schemaSQL}"`,
          'Creating schema and permissions'
        );
        await this.logger.success('Database and user created successfully');
      }

      // Test connection
      console.log('\n🔗 Testing database connection...');
      await this.execWithLogging(
        `PGPASSWORD=${dbPassword} ${this.getPsqlCommand()} -U ${dbUser} -h ${dbHost} -p ${dbPort} -d ${dbName} -c "SELECT 1;" 2>/dev/null`,
        'Testing database connection'
      );
      await this.logger.success('Database connection successful');
    } catch (err) {
      await this.logger.error('Database setup failed', { error: err.message });
      console.log('❌ Database setup failed:', err.message);
      console.log('You may need to set up the database manually.');

      const continueSetup = await this.question('Continue with bot configuration? (y/n): ');
      if (continueSetup.toLowerCase() !== 'y') {
        process.exit(1);
      }
    }
  }

  async setupBotConfiguration() {
    await this.logger.info('Starting bot configuration setup');
    console.log('\n🤖 Setting up bot configuration...');

    // Import and run bot discovery
    try {
      const { runSetup } = require('../setup-bots');
      await runSetup();
      await this.logger.success('Bot discovery and configuration completed');
    } catch (err) {
      await this.logger.error('Bot configuration failed', { error: err.message });
      console.log('❌ Bot configuration failed:', err.message);
      console.log('You can configure bots manually using the web interface.');
    }

    // Get basic configuration
    const port = (await this.question('Web interface port (3000): ')) || '3000';
    this.config.port = parseInt(port);

    const ageThreshold = (await this.question('Price age threshold in seconds (7200): ')) || '7200';
    this.config.ageThresholdSec = parseInt(ageThreshold);

    await this.logger.info('Basic configuration collected', {
      port: this.config.port,
      ageThresholdSec: this.config.ageThresholdSec,
    });
  }

  async checkAPIKeys() {
    await this.logger.info('Checking API keys configuration');
    console.log('\n🔑 API Keys Configuration');
    console.log('You need the following API keys:');
    console.log('1. Backpack.tf API Key: https://backpack.tf/api/register');
    console.log('2. Steam API Key: https://steamcommunity.com/dev/apikey');

    const hasKeys = await this.question('Do you have these API keys? (y/n): ');
    await this.logger.info('User API keys status', { hasKeys });

    if (hasKeys.toLowerCase() !== 'y') {
      await this.logger.warning('User does not have required API keys');
      console.log('\n📝 Please obtain your API keys before continuing:');
      console.log('• Backpack.tf: Register at https://backpack.tf/api/register');
      console.log('• Steam: Get key at https://steamcommunity.com/dev/apikey');
      console.log("• Configure them in your bot's config.json file");
      console.log('• You can also configure them via the web interface');
    }
  }

  async saveConfiguration() {
    await this.logger.info('Saving configuration');
    console.log('\n💾 Saving configuration...');

    try {
      // Check if pricerConfig.json exists
      const configPath = path.join(__dirname, '..', 'config', 'pricerConfig.json');
      let existingConfig = {};

      try {
        const configContent = await fs.readFile(configPath, 'utf8');
        existingConfig = JSON.parse(configContent);
        await this.logger.debug('Loaded existing configuration', { existingConfig });
      } catch {
        // File doesn't exist or is invalid, start fresh
        await this.logger.info('No existing configuration found, creating new one');
      }

      // Merge configurations
      const finalConfig = {
        ...existingConfig,
        ...this.config,
        version: '2.0',
        setupCompleted: true,
        setupDate: new Date().toISOString(),
      };

      await fs.writeFile(configPath, JSON.stringify(finalConfig, null, 2));
      await this.logger.success('Configuration saved successfully', { configPath });
      console.log('✅ Configuration saved to pricerConfig.json');

      return finalConfig;
    } catch (err) {
      await this.logger.error('Failed to save configuration', { error: err.message });
      console.log('❌ Failed to save configuration:', err.message);
      console.log('You may need to configure manually.');
      return null;
    }
  }

  async initializeDatabase() {
    await this.logger.info('Initializing database tables');
    console.log('\n🏗️  Initializing database tables...');

    try {
      const initSqlPath = path.join(__dirname, 'sql', 'initialize-db.sql');
      const { database } = this.config;

      if (
        await fs
          .access(initSqlPath)
          .then(() => true)
          .catch(() => false)
      ) {
        const cmd = `PGPASSWORD=${database.password} ${this.getPsqlCommand()} -U ${database.user} -h ${database.host} -p ${database.port} -d ${database.database} -f "${initSqlPath}"`;
        await this.execWithLogging(cmd, 'Initializing database tables from SQL file');
        await this.logger.success('Database tables initialized from SQL file');
      } else {
        await this.logger.warning(
          'initialize-db.sql not found, tables will be created on first run'
        );
        console.log('⚠️  initialize-db.sql not found, tables will be created on first run');
      }
    } catch (err) {
      await this.logger.error('Database initialization failed', { error: err.message });
      console.log('⚠️  Database initialization failed:', err.message);
      console.log('Tables will be created automatically on first run.');
    }
  }

  async checkDependencies() {
    await this.logger.info('Checking dependencies');
    console.log('\n📦 Checking dependencies...');

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

    if (majorVersion < 22) {
      await this.logger.error('Node.js version too old', { nodeVersion, required: '22.0.0+' });
      console.log(`❌ Node.js version ${nodeVersion} is too old. Please upgrade to v22.0.0+`);
      process.exit(1);
    }

    await this.logger.success(`Node.js ${nodeVersion} (supported)`);

    // Check if npm packages are installed
    try {
      await fs.access(path.join(__dirname, '..', 'node_modules'));
      await this.logger.success('npm packages installed');
    } catch {
      console.log('📦 Installing npm packages...');
      await this.execWithLogging('npm install', 'Installing npm packages');
      await this.logger.success('npm packages installed');
    }
  }

  async displaySummary(config) {
    await this.logger.success('Setup completed successfully');
    console.log('\n🎉 Setup Complete!');
    console.log('==================');

    if (config) {
      console.log(`✅ Web interface: http://localhost:${config.port}`);
      console.log(
        `✅ Database: ${config.database?.database}@${config.database?.host}:${config.database?.port}`
      );
      console.log(`✅ Configuration: pricerConfig.json`);
    }

    console.log('\n🚀 Next Steps:');
    console.log('1. Configure API keys in your bot config.json files');
    console.log('2. Start the autopricer: npm start');
    console.log('3. Visit the web interface to manage bots');
    console.log('4. Check the documentation in the docs/ folder');

    console.log('\n📚 Useful Commands:');
    console.log('• npm start          - Start the autopricer');
    console.log('• npm run dev        - Start in development mode');
    console.log('• npm run setup      - Re-run bot discovery');
    console.log('• npm run validate   - Validate configuration');

    console.log('\n🔗 Important Links:');
    console.log('• Bot Management: http://localhost:' + (config?.port || 3000) + '/bot-config');
    console.log('• Settings: http://localhost:' + (config?.port || 3000) + '/settings');
    console.log('• Documentation: ./docs/');

    console.log(`\n📋 Setup log saved to: ${this.logger.getLogFile()}`);
    console.log('If you encounter issues, please share this log file when reporting bugs.');

    await this.logger.info('Setup summary displayed', {
      logFile: this.logger.getLogFile(),
      setupDuration: new Date().getTime() - this.logger.setupStartTime.getTime(),
    });
  }

  async run() {
    try {
      await this.logger.ensureLogDir();
      await this.logger.logSystemInfo();

      console.log('🚀 Bliss Autopricer Setup');
      console.log('=========================');
      console.log('This setup will guide you through installing and configuring the autopricer.\n');

      await this.checkDependencies();
      await this.checkPostgreSQL();
      await this.setupDatabase();
      await this.setupBotConfiguration();
      await this.checkAPIKeys();

      const config = await this.saveConfiguration();

      if (config?.database) {
        await this.initializeDatabase();
      }

      await this.displaySummary(config);
    } catch (err) {
      await this.logger.error('Setup failed with unhandled error', {
        error: err.message,
        stack: err.stack,
      });
      console.error('❌ Setup failed:', err.message);
      console.error('Please check the documentation or run setup again.');
      console.log(`📋 Setup log saved to: ${this.logger.getLogFile()}`);
      console.log('Please share this log file when reporting issues.');
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new AutoPricerSetup();
  setup.run();
}

module.exports = AutoPricerSetup;
