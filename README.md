# Blossom Server List

This repository automatically fetches and maintains a list of [Blossom](https://github.com/hzrd149/blossom) servers discovered on the Nostr network.

## What It Does

This GitHub Action:
- Queries multiple Nostr relays for kind:36363 events (server lists)
- Discovers and lists all published Blossom servers
- Updates `BlossomListOutput.json` with the latest server list
- Clears commit history on each run to keep the repository lightweight (force-push)
- Preserves this README on every update

> NOTE: Because the commit history is replaced on each run (orphan branch + force push), forks, commit links, and contribution graphs for this repository will not accumulate historical commits. This is intentional to keep the repo minimal for raw consumption.

## Data Format

The `BlossomListOutput.json` file contains:

```json
{
  "success": true,
  "count": 123,
  "relays_searched": 20,
  "servers": [
    "https://blossom.example.com",
    "https://media.example.org"
  ],
  "timestamp": "2025-10-01T12:00:00.000Z"
}
```

## How It Works

1. **Relay Discovery**: Queries core Nostr relays (Damus, nos.lol, nostr.band, Primal) plus random relays from nostr.watch
2. **Server Discovery**: Looks for kind:36363 events containing Blossom server URLs in the "d" tag
3. **Deduplication**: Keeps only the newest announcement for each unique server URL
4. **Output**: Generates a JSON file with all discovered servers, sorted by newest first

## Triggering Updates

### From cron-job.org

1. **Create a Personal Access Token** in GitHub:
   - Go to Settings → Developer settings → Personal access tokens → Tokens (classic)
   - For a **public repository**, you can grant only `public_repo` scope (full `repo` scope works too but is broader)
   - Save the token securely (do *not* commit it)

2. **Set up cron-job.org**:
   - Create a new cron job at [cron-job.org](https://cron-job.org)
   - Set the URL to: `https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO/dispatches`
   - Method: `POST`
   - Add headers:
     - `Accept: application/vnd.github.v3+json`
     - `Authorization: Bearer YOUR_GITHUB_TOKEN`
     - `Content-Type: application/json`
   - Request body:
     ```json
     {"event_type": "update-blossom-list"}
     ```
   - Set your desired schedule (e.g., hourly, daily)

### Optional Direct curl Trigger

```bash
curl -X POST \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO/dispatches \
  -d '{"event_type":"update-blossom-list"}'
```

### Manual Trigger

You can also trigger the update manually:
- Go to the "Actions" tab in this repository
- Select "Update Blossom Server List"
- Click "Run workflow"

## Usage

Access the latest server list directly:
```
https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/BlossomListOutput.json
```

Or fetch it programmatically:
```javascript
const response = await fetch('https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/BlossomListOutput.json');
const data = await response.json();
console.log(`Found ${data.count} Blossom servers`);
```

## Technical Details

- **Language**: Node.js 20
- **Key Dependencies**: `ws` (WebSocket client)
- **Relay Timeout**: 5 seconds per relay
- **Concurrency**: 6 parallel relay queries
- **History**: Cleared on each run to prevent repository bloat (force push)
- **Artifacts Tracked**: Only essential code + `BlossomListOutput.json` (no `node_modules` committed)
- **Determinism**: Relay selection beyond core set is randomized each run (affects discovered set order subtly)

## Operational Notes

- The workflow intentionally excludes `node_modules` (installed fresh each run)
- Force-pushing each run means commit SHAs change; consumers should reference the raw file URL, not a commit pin
- If you want stable history instead, remove the orphan-branch logic in the workflow

## About Blossom

Learn more: [Blossom Protocol](https://github.com/hzrd149/blossom)

## License

Public domain / CC0
