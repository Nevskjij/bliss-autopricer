#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 BPTF Autopricer Configuration Validator');
console.log('==========================================\n');

const configPath = path.resolve(__dirname, 'config.json');

// Check if config.json exists
if (!fs.existsSync(configPath)) {
  console.log('❌ config.json not found!');
  console.log('Please make sure config.json exists in the project root.');
  process.exit(1);
}

try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  let errors = [];
  let warnings = [];

  // Check API keys
  if (!config.bptfAPIKey || config.bptfAPIKey === 'your bptf api key') {
    errors.push('❌ bptfAPIKey is not configured (still has placeholder value)');
  } else if (config.bptfAPIKey.length < 10) {
    warnings.push("⚠️  bptfAPIKey seems too short - make sure it's correct");
  } else {
    console.log('✅ bptfAPIKey is configured');
  }

  if (!config.bptfToken || config.bptfToken === 'your bptf token') {
    errors.push('❌ bptfToken is not configured (still has placeholder value)');
  } else if (config.bptfToken.length < 10) {
    warnings.push("⚠️  bptfToken seems too short - make sure it's correct");
  } else {
    console.log('✅ bptfToken is configured');
  }

  if (!config.steamAPIKey || config.steamAPIKey === 'your steam api key') {
    errors.push('❌ steamAPIKey is not configured (still has placeholder value)');
  } else if (config.steamAPIKey.length !== 32) {
    warnings.push("⚠️  steamAPIKey should be 32 characters long - make sure it's correct");
  } else {
    console.log('✅ steamAPIKey is configured');
  }

  // Check database config
  if (!config.database) {
    errors.push('❌ database configuration is missing');
  } else {
    if (!config.database.password || config.database.password === 'database password') {
      errors.push('❌ database password is not configured (still has placeholder value)');
    } else {
      console.log('✅ database password is configured');
    }

    if (config.database.host) {
      console.log('✅ database host is configured');
    }

    if (config.database.name) {
      console.log('✅ database name is configured');
    }
  }

  // Print results
  console.log('\n📊 Validation Results:');
  console.log('======================');

  if (errors.length === 0) {
    console.log('🎉 Configuration looks good! You should be able to start the autopricer.');

    if (warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      warnings.forEach((warning) => console.log(`   ${warning}`));
    }

    console.log('\n🚀 Next steps:');
    console.log('   1. Set up PostgreSQL database: see README.md');
    console.log('   2. Run bot setup: npm run setup');
    console.log('   3. Start autopricer: npm start');
  } else {
    console.log('❌ Configuration has errors that need to be fixed:');
    errors.forEach((error) => console.log(`   ${error}`));

    console.log('\n🔧 To fix these issues:');
    console.log('   1. Edit config.json');
    console.log('   2. Replace placeholder values with your actual API keys');
    console.log('   3. Get API keys from:');
    console.log('      - Backpack.tf: https://backpack.tf/developer');
    console.log('      - Steam: https://steamcommunity.com/dev/apikey');
    console.log('   4. Run this validator again: node validate-config.js');
  }
} catch (error) {
  console.log('❌ Error reading config.json:');
  console.log(`   ${error.message}`);
  console.log('\nMake sure config.json contains valid JSON.');
}
