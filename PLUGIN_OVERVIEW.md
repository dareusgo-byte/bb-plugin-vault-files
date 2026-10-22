## What you get

Keep a document library beside any BB chat. Browse folders, filter the current folder by name, and open files without copying them into the conversation. File cards show the name, size and path, with buttons for local preview and an existing Google Drive copy.

Markdown and text open in a reading panel with a source toggle. Other formats use BB's installed viewers. Office documents need the separate Office Viewer plugin. Click the labelled path to select the file in Finder on macOS or Explorer on Windows (Linux opens its containing folder); copy its exact Drive URL with the adjacent clipboard button. Original folded-page SVG icons distinguish documents, spreadsheets, PDFs, presentations, images, video and code by colour.

## How it works

Choose your local vault folder in the plugin settings. Add its Google Drive folder link if you want Drive buttons. The plugin searches the exact folder chain in Drive for Desktop's local index, and leaves the link unset when the result is missing or ambiguous. A found link does not verify that the latest file contents have synced.

Agents get the `vault_file_link` tool, the `bb vault-files` command and a shared instruction to return file cards. Existing messages are not rewritten automatically.

## Requirements

BB 0.46+, Plugin SDK 0.6.49–0.6.x, and Python 3 on the file-hosting computer. Local browsing supports macOS, Windows and Linux. Existing-copy lookup requires macOS or Windows and Google Drive for Desktop.

Without desktop sync, choose in settings whether future delivered files should be uploaded. Opt-in uploads run through the agent’s separately connected Google Drive upload/update tools; the plugin records their returned links and checks the local SHA-256. Missing tools or upload failures must be reported. It does not obtain connector credentials, change sharing or upload a whole vault in the background. Existing desktop sync needs no API key; agent uploads require a Google account and a separate Drive connector. Settings belong to each user's BB installation.
