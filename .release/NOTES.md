Vault Files keeps a document library beside BB chats and adds file cards with local previews and Google Drive links.

- Original SVG file icons with distinct colours for documents, spreadsheets, PDF, slides, images, video and code.
- Click the file path to reveal it in Finder on macOS or Explorer on Windows. Linux opens the containing folder.
- Copy the exact Drive link from the card or document panel.
- Read Markdown and text beside the chat; use BB viewers for other formats.
- Choose in settings whether an agent should upload future delivered files through its separately connected Google Drive tools. No upload happens before opt-in, and missing tools or upload failures must be reported.
- Existing Google Drive for Desktop copies are found through their exact folder chain on macOS and Windows.

Requires BB 0.46+ and Python 3. Office previews require the separate Office Viewer plugin. Automatic uploads require a separately connected Google Drive connector with upload/update tools. The plugin does not receive its OAuth credentials or change file sharing.

The attached archive includes the source, prebuilt bundles and a Russian user guide. Extract it to a permanent directory and ask a BB agent to install and configure it for your own vault.

Git installation:

```sh
bb plugin install git:https://github.com/dareusgo-byte/bb-plugin-vault-files.git@^1.0.0
```
