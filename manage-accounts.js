#!/usr/bin/env node
// CLI tool for managing multiple Google Calendar accounts

import 'dotenv/config';
import * as accountManager from './google-account-manager.js';
import readline from 'readline';

const [command, ...args] = process.argv.slice(2);

// Create readline interface for prompting user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisified question function
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  try {
    switch (command) {
      case 'list':
        await listCommand();
        break;
      case 'add':
        await addCommand(args[0]);
        break;
      case 'remove':
        await removeCommand(args[0]);
        break;
      case 'info':
        await infoCommand(args[0]);
        break;
      default:
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

async function listCommand() {
  console.log('📋 Configured Google Accounts:\n');
  const accounts = await accountManager.listAccounts();
  
  if (accounts.length === 0) {
    console.log('No accounts configured yet.');
    console.log('\nAdd an account with: node manage-accounts.js add <accountId>');
    return;
  }
  
  accounts.forEach((account) => {
    console.log(`• ${account.id}`);
    if (account.name) console.log(`  Name: ${account.name}`);
    if (account.email) console.log(`  Email: ${account.email}`);
    if (account.addedAt) console.log(`  Added: ${new Date(account.addedAt).toLocaleString()}`);
    console.log();
  });
  
  console.log(`Total: ${accounts.length} account(s)`);
}

async function addCommand(accountId) {
  if (!accountId) {
    console.error('❌ Error: Account ID required');
    console.log('\nUsage: node manage-accounts.js add <accountId>');
    console.log('Example: node manage-accounts.js add work');
    process.exit(1);
  }
  
  // Check if account already exists
  const exists = await accountManager.accountExists(accountId);
  if (exists) {
    console.error(`❌ Account '${accountId}' already exists.`);
    console.log('\nTo update, remove it first: node manage-accounts.js remove ' + accountId);
    process.exit(1);
  }
  
  // Prompt for optional metadata
  console.log(`\n🆕 Adding new account: ${accountId}`);
  console.log('Enter optional details (press Enter to skip):\n');
  
  const name = await question('Display name: ');
  const email = await question('Email address: ');
  const description = await question('Description: ');
  
  const metadata = {};
  if (name) metadata.name = name;
  if (email) metadata.email = email;
  if (description) metadata.description = description;
  
  await accountManager.addAccount(accountId, metadata);
  
  console.log(`\n✅ Account '${accountId}' added successfully!`);
  console.log('\nNext steps:');
  console.log(`1. Authorize the account: node test-calendar.js ${accountId}`);
  console.log('2. Follow the OAuth flow in your browser');
}

async function removeCommand(accountId) {
  if (!accountId) {
    console.error('❌ Error: Account ID required');
    console.log('\nUsage: node manage-accounts.js remove <accountId>');
    process.exit(1);
  }
  
  // Check if account exists
  const exists = await accountManager.accountExists(accountId);
  if (!exists) {
    console.error(`❌ Account '${accountId}' not found.`);
    process.exit(1);
  }
  
  // Confirm deletion
  const confirm = await question(`⚠️  Remove account '${accountId}' and delete its tokens? (yes/no): `);
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    return;
  }
  
  await accountManager.removeAccount(accountId);
  console.log(`✅ Account '${accountId}' removed successfully.`);
}

async function infoCommand(accountId) {
  if (!accountId) {
    console.error('❌ Error: Account ID required');
    console.log('\nUsage: node manage-accounts.js info <accountId>');
    process.exit(1);
  }
  
  const account = await accountManager.getAccount(accountId);
  
  if (!account) {
    console.error(`❌ Account '${accountId}' not found.`);
    process.exit(1);
  }
  
  // Check if tokens exist
  const tokens = await accountManager.loadTokens(accountId);
  const authorized = tokens !== null;
  
  console.log(`\n📋 Account: ${accountId}\n`);
  
  if (account.name) console.log(`Name: ${account.name}`);
  if (account.email) console.log(`Email: ${account.email}`);
  if (account.description) console.log(`Description: ${account.description}`);
  if (account.addedAt) console.log(`Added: ${new Date(account.addedAt).toLocaleString()}`);
  
  console.log(`\nAuthorization: ${authorized ? '✅ Authorized' : '❌ Not authorized'}`);
  
  if (authorized && tokens.expiry_date) {
    const expiryDate = new Date(tokens.expiry_date);
    const now = new Date();
    const expired = expiryDate < now;
    console.log(`Token expiry: ${expiryDate.toLocaleString()} ${expired ? '(expired, will auto-refresh)' : ''}`);
  }
  
  if (!authorized) {
    console.log(`\nTo authorize: node test-calendar.js ${accountId}`);
  }
}

function showHelp() {
  console.log(`
📅 Google Calendar Account Manager

Usage: node manage-accounts.js <command> [args]

Commands:
  list                    List all configured accounts
  add <accountId>        Add a new account
  remove <accountId>     Remove an account and its tokens
  info <accountId>       Show account details and authorization status

Examples:
  node manage-accounts.js list
  node manage-accounts.js add work
  node manage-accounts.js info personal
  node manage-accounts.js remove client1

After adding an account, authorize it with:
  node test-calendar.js <accountId>
`);
}

main();
