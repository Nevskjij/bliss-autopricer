# 🚀 Quick Setup Reference

## One Universal Setup Command

**All Platforms:** Windows, macOS, Linux, WSL, SSH

```bash
cd setup
node universal-setup.js
```

This single script automatically:

- ✅ Detects your environment (platform, SSH, WSL)
- ✅ Installs PostgreSQL if needed
- ✅ Fixes authentication issues
- ✅ Finds bot directories intelligently
- ✅ Creates secure configuration with generated passwords
- ✅ Provides platform-specific next steps

## 🔧 Common Issues & Quick Fixes

### "PostgreSQL peer authentication failed"
**Solution:** The universal script fixes this automatically. If it still fails:
```bash
node setup/universal-setup.js  # Re-run to retry auth fixes
```

### "Directory conflict" or "Inside bot folder"
**Problem:** Installing inside bot directories causes conflicts.

**Solution:** Use a dedicated directory:
```bash
# WRONG: /home/user/tf2autobot/autopricer
# RIGHT: /home/user/autopricer

mkdir ~/autopricer && cd ~/autopricer
# Copy autopricer files here, then run setup
```

### Can't access web interface via SSH
**Solution:** Create SSH tunnel on your local machine:
```bash
ssh -L 3000:localhost:3000 user@server
# Then visit http://localhost:3000
```

### "Module not found" errors
**Solution:**
```bash
npm install
```

## � After Setup

1. **Configure API Keys** (the setup script will remind you):
   - Backpack.tf: <https://backpack.tf/api/register>
   - Steam: <https://steamcommunity.com/dev/apikey>
   - Add these to your bot config.json files

2. **Start the autopricer:**
   ```bash
   # For SSH/remote sessions, use screen for persistence
   screen -S autopricer
   npm start
   # Ctrl+A, D to detach
   ```

3. **Access web interface:**
   - **Local:** <http://localhost:3000>
   - **SSH:** Use tunnel (see above)

## 🆘 Still Having Issues?

**Check setup logs:** The universal script creates detailed logs and shows you the file location.

**Need more help?**
- **Detailed setup:** [`docs/INSTALLATION.md`](INSTALLATION.md)
- **Troubleshooting:** [`docs/TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
- **Remote/SSH setup:** [`docs/REMOTE_SETUP.md`](REMOTE_SETUP.md)
