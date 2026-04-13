# Alfred Workflow Development Guide

This document captures lessons learned from building the Portio Alfred workflow. Use this as a reference when building future workflows.

## Table of Contents

1. [Workflow Structure](#workflow-structure)
2. [The info.plist File](#the-infoplist-file)
3. [Script Filter Configuration](#script-filter-configuration)
4. [Avoiding Common Issues](#avoiding-common-issues)
5. [Chaining Script Filters](#chaining-script-filters)
6. [The Wrapper Script Pattern](#the-wrapper-script-pattern)
7. [Passing Data Between Steps](#passing-data-between-steps)
8. [Installation & Distribution](#installation--distribution)
9. [Debugging Tips](#debugging-tips)

---

## Workflow Structure

A typical Alfred workflow has this structure:

```
my-workflow/
├── info.plist          # Workflow configuration (REQUIRED)
├── icon.png            # Workflow icon (shown in Alfred Preferences)
├── my-script           # Executable wrapper script
├── scripts/            # Node.js scripts
│   ├── list-items.js
│   └── execute-action.js
├── lib/                # Shared libraries
│   └── api.js
├── icons/              # Action icons
│   ├── cursor.png
│   └── finder.png
└── package.json        # Node dependencies (optional)
```

### Key Files

| File | Purpose |
|------|---------|
| `info.plist` | XML configuration defining triggers, connections, and UI |
| `icon.png` | Main workflow icon (appears in Alfred Preferences) |
| Wrapper script | Shell script that sources nvm and runs Node.js |

---

## The info.plist File

The `info.plist` is the heart of your workflow. It's an XML file that defines:

- **Triggers** (keywords, hotkeys)
- **Objects** (script filters, actions)
- **Connections** between objects
- **Workflow metadata** (name, description, bundle ID)

### Basic Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>bundleid</key>
    <string>com.yourname.workflow</string>
    
    <key>name</key>
    <string>My Workflow</string>
    
    <key>description</key>
    <string>What this workflow does</string>
    
    <key>disabled</key>
    <false/>
    
    <key>objects</key>
    <array>
        <!-- Script filters, actions, etc. -->
    </array>
    
    <key>connections</key>
    <dict>
        <!-- How objects connect to each other -->
    </dict>
    
    <key>uidata</key>
    <dict>
        <!-- Visual positions in Alfred's editor -->
    </dict>
</dict>
</plist>
```

---

## Script Filter Configuration

Script filters are the most common workflow input. They run a script and display results in Alfred.

### Critical Settings

| Setting | Recommended Value | Description |
|---------|-------------------|-------------|
| `alfredfiltersresults` | `false` | **CRITICAL**: Set to `false` to prevent Alfred from mixing its default results with your workflow |
| `withspace` | `true` | Require space after keyword (e.g., "p " not just "p") |
| `escaping` | `62` | Standard escaping for shell scripts |
| `scriptargtype` | `0` | Pass query as argument to script |
| `queuedelayimmediatelyinitially` | `false` | Match working workflows like Font Awesome |
| `argumenttype` | `1` | Optional argument (use `2` for required) |

### Example Script Filter Object

```xml
<dict>
    <key>config</key>
    <dict>
        <key>alfredfiltersresults</key>
        <false/>
        <key>alfredfiltersresultsmatchmode</key>
        <integer>0</integer>
        <key>argumenttreatemptyqueryasnil</key>
        <false/>
        <key>argumenttrimmode</key>
        <integer>0</integer>
        <key>argumenttype</key>
        <integer>1</integer>
        <key>escaping</key>
        <integer>62</integer>
        <key>keyword</key>
        <string>mykeyword</string>
        <key>queuedelaycustom</key>
        <integer>1</integer>
        <key>queuedelayimmediatelyinitially</key>
        <false/>
        <key>queuedelaymode</key>
        <integer>0</integer>
        <key>queuemode</key>
        <integer>1</integer>
        <key>runningsubtext</key>
        <string>Loading...</string>
        <key>script</key>
        <string>./my-script --list {query}</string>
        <key>scriptargtype</key>
        <integer>0</integer>
        <key>scriptfile</key>
        <string></string>
        <key>subtext</key>
        <string>Search description</string>
        <key>title</key>
        <string>Search Title</string>
        <key>type</key>
        <integer>0</integer>
        <key>withspace</key>
        <true/>
    </dict>
    <key>type</key>
    <string>alfred.workflow.input.scriptfilter</string>
    <key>uid</key>
    <string>unique-id-here</string>
    <key>version</key>
    <integer>3</integer>
</dict>
```

---

## Avoiding Common Issues

### Issue 1: Alfred Mixes Default Results with Workflow

**Symptom**: When typing your keyword, you see both workflow results AND Alfred's default file/folder search.

**Cause**: Alfred's "Default Results" includes folders, files, etc. that match your query.

**Solutions**:

1. **Set `alfredfiltersresults: false`** in your script filter config
2. **Disable folders in Default Results**:
   - Alfred Preferences → Features → Default Results → Uncheck "Folders"
   - Or programmatically edit: `~/Library/Application Support/Alfred/Alfred.alfredpreferences/preferences/features/defaultresults/prefs.plist`

```xml
<key>showFolders</key>
<false/>
```

### Issue 2: Raw JSON Showing Instead of Action Menu

**Symptom**: Selecting an item shows raw JSON like `{"id":"project","name":"..."}`

**Cause**: The `arg` value is JSON, and Alfred displays it in the search bar.

**Solution**: Use simple string arguments (like IDs) instead of JSON:

```javascript
// BAD - JSON arg shows in Alfred
{
  arg: JSON.stringify({ id: "project", name: "My Project", path: "/path" })
}

// GOOD - Simple string arg
{
  arg: "project-id"  // Just the ID
}
```

Then look up the full data in your next script using a cache file.

### Issue 3: Node.js Not Found

**Symptom**: Workflow doesn't run, or shows "node not found"

**Cause**: Alfred doesn't inherit your shell's PATH, so nvm-installed Node isn't found.

**Solution**: Use a wrapper shell script that sources nvm:

```bash
#!/bin/bash
cd "$(dirname "$0")"

# Source nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

node scripts/my-script.js "$@"
```

### Issue 4: JSON Parse Error

**Symptom**: "Invalid project data: unexpected token" or similar

**Cause**: Alfred's escaping modified your JSON, or the arg isn't valid JSON.

**Solution**: 
- Use `escaping: 62` (or `0` for no escaping)
- Pass simple strings instead of JSON
- Use a cache file to store complex data

---

## Chaining Script Filters

To create a multi-step workflow (e.g., Select Project → Select Action → Execute):

### 1. Define Connections in info.plist

```xml
<key>connections</key>
<dict>
    <key>step1-uid</key>
    <array>
        <dict>
            <key>destinationuid</key>
            <string>step2-uid</string>
            <key>modifiers</key>
            <integer>0</integer>
        </dict>
    </array>
    <key>step2-uid</key>
    <array>
        <dict>
            <key>destinationuid</key>
            <string>execute-uid</string>
            <key>modifiers</key>
            <integer>0</integer>
        </dict>
    </array>
</dict>
```

### 2. Use Simple Args Between Steps

Step 1 outputs:
```javascript
{ arg: "cadence" }  // Just the project ID
```

Step 2 receives "cadence" as input, looks up data from cache, outputs:
```javascript
{ arg: "cursor:cadence" }  // action:projectId format
```

Step 3 (execute) receives "cursor:cadence" and performs the action.

---

## The Wrapper Script Pattern

Create a shell script as the entry point that handles nvm and routes to Node scripts:

### `portio` (wrapper script)

```bash
#!/bin/bash
cd "$(dirname "$0")"

# Source nvm if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

case "$1" in
  --list)
    node scripts/list-projects.js "$2"
    ;;
  --actions)
    node scripts/project-actions.js "$2"
    ;;
  --execute)
    node scripts/execute-action.js "$2"
    ;;
  *)
    echo '{"items":[{"title":"Unknown command","valid":false}]}'
    ;;
esac
```

Make it executable: `chmod +x portio`

Reference in info.plist as: `./portio --list {query}`

---

## Passing Data Between Steps

### The Cache File Pattern

Since Alfred shows the `arg` value in the UI, use a cache file to store complex data:

**Step 1 (list-projects.js)**:
```javascript
// Save all project data to cache
const cache = {};
projects.forEach(p => {
  cache[p.id] = { id: p.id, name: p.name, path: p.path };
});
fs.writeFileSync('.project-cache.json', JSON.stringify(cache));

// Return simple arg
return {
  items: projects.map(p => ({
    title: p.name,
    arg: p.id  // Simple string - just the ID
  }))
};
```

**Step 2 (project-actions.js)**:
```javascript
// Load from cache
const cache = JSON.parse(fs.readFileSync('.project-cache.json'));
const project = cache[projectId];  // Look up by ID received from step 1
```

### Modifier Keys for Quick Actions

Use `mods` to provide shortcuts:

```javascript
{
  title: "My Project",
  arg: "my-project",
  mods: {
    cmd: {
      subtitle: "Open in Cursor",
      arg: "cursor:my-project"  // Goes directly to execute
    },
    alt: {
      subtitle: "Open in Finder",
      arg: "finder:my-project"
    }
  }
}
```

Configure connections for modifiers in info.plist:
```xml
<dict>
    <key>destinationuid</key>
    <string>execute-uid</string>
    <key>modifiers</key>
    <integer>1048576</integer>  <!-- Cmd key -->
    <key>modifiersubtext</key>
    <string>Open in Cursor</string>
</dict>
```

Modifier codes:
- `0` = No modifier (normal Enter)
- `1048576` = Cmd
- `524288` = Alt/Option
- `262144` = Ctrl
- `131072` = Shift

---

## Installation & Distribution

### Method 1: Symlink (Development)

```javascript
const fs = require('fs');
const path = require('path');

const SOURCE = '/path/to/your/workflow';
const ALFRED_WORKFLOWS = '~/Library/Application Support/Alfred/Alfred.alfredpreferences/workflows';

// Check for custom sync folder first
const syncFolder = execSync('defaults read com.runningwithcrayons.Alfred-Preferences syncfolder 2>/dev/null')
  .toString().trim();

if (syncFolder) {
  // Expand ~ to home directory
  ALFRED_WORKFLOWS = path.join(syncFolder.replace('~', os.homedir()), 
    'Alfred.alfredpreferences/workflows');
}

fs.symlinkSync(SOURCE, path.join(ALFRED_WORKFLOWS, 'my-workflow'));
```

### Method 2: .alfredworkflow Package (Distribution)

```bash
# Create a zip file with .alfredworkflow extension
cd /path/to/workflow
zip -r MyWorkflow.alfredworkflow . -x "*.git*" -x "*node_modules*"

# Users can double-click to install
```

### Restarting Alfred

After installing or updating a workflow:
```bash
killall Alfred
sleep 1
open -a "Alfred 5"
```

---

## Debugging Tips

### 1. Test Scripts Directly

```bash
cd /path/to/workflow
./portio --list ""
./portio --list "search term"
./portio --actions "project-id"
```

### 2. Validate info.plist

```bash
plutil -lint info.plist
```

### 3. Check Workflow is Loaded

```bash
ls ~/Library/Application\ Support/Alfred/Alfred.alfredpreferences/workflows/
```

### 4. View Workflow Configuration

```bash
plutil -p info.plist | head -100
```

### 5. Compare with Working Workflow

If a workflow like Font Awesome works, compare configurations:
```bash
plutil -extract objects.0.config json -o - /path/to/working/workflow/info.plist
```

### 6. Check Alfred's Debug Log

In Alfred Preferences → Workflows → Select your workflow → Click the bug icon (🐛) to enable debugging.

---

## Quick Reference: Script Filter JSON Output

Your scripts must output valid JSON with an `items` array:

```json
{
  "items": [
    {
      "uid": "unique-id",
      "title": "Item Title",
      "subtitle": "Item description",
      "arg": "value-passed-to-next-step",
      "icon": {
        "path": "/absolute/path/to/icon.png"
      },
      "valid": true,
      "autocomplete": "Auto Complete Text",
      "mods": {
        "cmd": {
          "subtitle": "Cmd+Enter action",
          "arg": "cmd-arg-value"
        }
      }
    }
  ]
}
```

### Icon Paths

- Relative paths are relative to the workflow folder: `"path": "icons/cursor.png"`
- Absolute paths work for project-specific icons: `"path": "/Users/me/project/icon.png"`

---

## Summary Checklist

When creating a new workflow:

- [ ] Create `info.plist` with proper structure
- [ ] Set `alfredfiltersresults: false` to prevent result mixing
- [ ] Use a wrapper shell script that sources nvm
- [ ] Use simple string `arg` values (not JSON)
- [ ] Use a cache file for complex data between steps
- [ ] Set `withspace: true` for keyword triggers
- [ ] Use `escaping: 62` for script filters
- [ ] Test scripts directly before testing in Alfred
- [ ] Validate `info.plist` with `plutil -lint`

---

## Resources

- [Alfred Workflows Documentation](https://www.alfredapp.com/help/workflows/)
- [Script Filter JSON Format](https://www.alfredapp.com/help/workflows/inputs/script-filter/json/)
- [Alfred Forum](https://www.alfredforum.com/)
