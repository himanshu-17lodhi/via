# Via Sync

> **Git-like version control and multi-cloud synchronization for Obsidian, powered by rclone.**

Via Sync gives your Obsidian vault an intentional, developer-friendly sync workflow. Instead of silently overwriting files, it lets you inspect changes, review diffs, create local snapshots, restore earlier states, and synchronize with more than 70 cloud storage providers.

---

## Features

- **Built-in Terminal:** Run sync commands from a native-feeling terminal inside Obsidian.
- **Local Snapshots (Commits):** Save a point-in-time copy of your vault before major edits and restore it later.
- **Conflict Awareness:** Inspect differences between your local vault and remote storage before pushing.
- **Automated Sync:**  Optionally enable background auto-push on a configured interval.
- **`.viaignore` Support:**  Exclude files, folders, caches, or settings using standard pattern matching.
- **Multi-Cloud Backing:** Works with Google Drive, OneDrive, Dropbox, Amazon S3, WebDAV, Nextcloud, and any rclone-supported backend.
---

## Requirements

- Obsidian desktop on Windows, macOS, or Linux.
- The `rclone` command-line tool installed on your computer.
- A configured rclone remote for your chosen cloud provider.

> Mobile is not supported. Via Sync is currently desktop-only.


## Install `rclone`

**Windows (PowerShell)**
```powershell
winget install Rclone.Rclone
```

**macOS (Homebrew)**
```bash
Bashbrew install rclone
```

**Linux:**
```Bash
sudo -v ; curl [https://rclone.org/install.sh](https://rclone.org/install.sh) | sudo bash
```

Alternatively, download a prebuilt binary from the official rclone downloads page.


## Configure a cloud remote

Run the rclone setup wizard in your system terminal:

```bash
rclone config
```

1. Enter n to create a new remote.
2. Choose a memorable name, such as gdrive or onedrive.
3. Select your cloud provider.
4. Complete the authentication prompts.

rclone stores all remote configuration in one file; you can locate it with:

```bash
rclone config file
```

Example output:

```bash
Configuration file is stored at:
/home/user/.rclone.conf
```

## Set up Via

1, Install and enable **Via** from Obsidian’s Community Plugins.
2. Open **Settings** → **Via** Setup.
3. Complete the following fields:


| Setting                 | Description                                    | Example                 |
| ----------------------- | ---------------------------------------------- | ----------------------- |
| Rclone config file path | Full path to your rclone configuration file    | /home/user/.rclone.conf |
| Rclone remote name      | The exact remote name created in rclone config | gdrive                  |
| Remote folder           | Target folder inside your cloud storage        | ObsidianVault           |


4. Click Test Now.
5. A green confirmation notice means the remote is reachable and ready.

## Open the terminal
Open the Via terminal by either:
1. Clicking the Git branch icon in the left ribbon.
2. Clicking the via: ready indicator in Obsidian’s status bar.

### Commands

| Command                  | Description                                                                 |
| ------------------------ | --------------------------------------------------------------------------- |
| via status               | Check files added, modified, or deleted locally. Runs offline.              |
| via diff                 | Inspect differences between local vault files and the remote.               |
| via pull                 | Fetch and apply remote changes to your local vault.                         |
| via push                 | Upload local changes to the configured remote.                              |
| via sync                 | Perform a bidirectional sync. Use cautiously on active multi-device vaults. |
| via commit "<message>"   | Create a named local snapshot of the current vault state.                   |
| via log                  | Display local snapshots and commit history.                                 |
| via restore <id>         | Revert the vault to a specific snapshot ID.                                 |
| via conflicts            | Check whether remote files have drifted since the last synchronization.     |
| via ignore add <pattern> | Append a file, folder, or glob pattern to .viaignore.                       |
| clear                    | Clear the current terminal buffer.                                          |


#### Example workflow
```bash
via commit "pre-sync snapshot"
via status
via diff
via push
```

### To restore an earlier state:
```bash
via log
via restore <snapshot-id>
```

### Ignore files
Create or update .viaignore to prevent selected files from being synchronized:
```text
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.trash/
*.tmp
```

####Add a new ignore rule from the terminal:
```bash
via ignore add ".obsidian/workspace.json"
```

##  Google Drive notice
If you use rclone’s default shared Google Drive client ID, Google may periodically deprecate high-volume shared credentials. If authentication or quota errors occur:
1. Follow the rclone Google Drive setup guide.
2. Create your own free Google Cloud OAuth Client ID and Client Secret.
3. Update the remote through rclone config.
4. Re-test the connection in Via Sync.

## Safety practices
Network synchronization can create race conditions when multiple devices modify the same vault simultaneously.

Before running your first via pull or via sync against a new remote, create a baseline snapshot:

```bash
via commit "pre-sync snapshot"
```

If an unwanted merge or overwrite occurs, inspect the history and restore the prior snapshot:
```bash
via log
via restore <id>
```

## Development
To build or test the plugin locally:

```bash
# Clone the repository
git clone https://github.com/your-username/via-sync.git
cd via-sync

# Install dependencies
npm install

# Start the development build with hot reloading
npm run dev
```

For testing inside Obsidian, copy or link the built files into your vault’s plugin directory:

```text
<VaultFolder>/.obsidian/plugins/via/
├── main.js
├── manifest.json
└── styles.css
```
Then enable Via Sync in Settings → Community plugins.
