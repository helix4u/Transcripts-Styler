# Transcript Styler

A powerful Chrome extension that extracts, enhances, and transforms transcripts using AI. Currently supports YouTube with plans for additional platforms. Features multiple LLM providers, text-to-speech capabilities, and comprehensive export options.

## 🚀 Features

### Core Functionality
- **Automatic Transcript Extraction**: Fetches transcripts in multiple formats (VTT, SRV3) - currently supports YouTube
- **AI-Powered Restyling**: Transform transcripts using OpenAI, Anthropic, or OpenAI-compatible APIs
- **Multi-Language Support**: Handles transcripts in various languages with customizable output languages
- **Text-to-Speech**: Generate audio from transcripts using multiple TTS providers
- **Multiple Export Formats**: Export as TXT, SRT, VTT, or JSON

### Advanced Features
- **ASCII Sanitization**: Clean up special characters with OpenAI logit bias support
- **Customizable Themes**: Dark, light, and system theme options
- **Preset Management**: Save and share configuration presets
- **Debug Logging**: Comprehensive logging for troubleshooting
- **Drag-and-Drop UI**: Moveable overlay interface
- **Real-time Progress**: Live updates during processing

### LLM Provider Support
- **OpenAI**: GPT models with full API support
- **Anthropic**: Claude models via official API
- **OpenAI-Compatible**: Support for local models (Ollama, LM Studio, etc.)

### TTS Provider Support
- **OpenAI TTS**: High-quality neural voices
- **Azure Speech Services**: Microsoft's premium TTS with SSML support
- **Browser TTS**: Built-in browser speech synthesis
- **Custom FastAPI**: Support for local TTS servers (Kokoro, XTTS, F5-TTS)

## 📦 Installation

### Method 1: Load as Unpacked Extension (Development)

1. **Download the Extension**
   ```bash
   git clone https://github.com/helix4u/Transcripts-Styler.git
   cd Transcripts-Styler
   ```

2. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the extension folder
   - The extension should now appear in your extensions list

3. **Verify Installation**
   - Navigate to any YouTube video
   - The transcript styler overlay should appear in the top-left corner

### Method 2: Chrome Web Store (Coming Soon)
The extension will be available on the Chrome Web Store once it passes review.

## 🔧 Setup & Configuration

### API Keys Setup
The extension requires API keys for LLM and TTS functionality. **Keys are stored in memory only** and are never persisted to disk.

#### OpenAI Setup
1. Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. In the extension overlay, select "OpenAI" as provider
3. Enter your API key in the "API Key" field
4. Set Base URL to `https://api.openai.com` (default)
5. Choose a model (e.g., `gpt-4`, `gpt-3.5-turbo`)

#### Anthropic Setup
1. Get an API key from [Anthropic Console](https://console.anthropic.com/)
2. Select "Anthropic" as provider
3. Enter your API key
4. Set Base URL to `https://api.anthropic.com` (default)
5. Choose a model (e.g., `claude-3-sonnet-20240229`)

#### OpenAI-Compatible Setup (Local Models)
For local models using Ollama, LM Studio, or similar:
1. Select "OpenAI-Compatible" as provider
2. Set Base URL to your local server (e.g., `http://localhost:11434`)
3. Enter any API key (can be dummy for local servers)
4. Set the model name as configured in your local setup

### TTS Setup

#### OpenAI TTS
- Use the same API key as LLM setup
- Available voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

#### Azure Speech Services
1. Get an Azure Speech Services subscription
2. Note your region (e.g., `eastus`, `westus2`)
3. Enter your subscription key in the API Key field
4. Set the Azure region
5. Click "List Voices" to see available options

#### Browser TTS
- No setup required
- Uses your system's built-in voices
- Adjust rate and select from available system voices

## 📖 Usage Guide

### Basic Workflow

1. **Navigate to Supported Platform**
   - Open any YouTube video with captions (more platforms coming soon)
   - The overlay will appear automatically

2. **Extract Transcript**
   - Click "Detect" to auto-detect the video ID
   - Click "List Tracks" to see available caption languages
   - Select your preferred track
   - Click "Fetch Transcript" to load the captions

3. **Configure AI Styling**
   - Set up your LLM provider (API key, model, etc.)
   - Choose a style preset or create custom prompts
   - Adjust concurrency settings (1-10 parallel requests)
   - Enable ASCII-only mode if needed

4. **Restyle Transcript**
   - Click "Restyle All" to begin AI processing
   - Monitor progress in real-time
   - Use "Stop" to cancel if needed

5. **Generate TTS (Optional)**
   - Enable TTS and configure provider
   - Click "Generate TTS" to create audio
   - Play inline or download the audio file

6. **Export Results**
   - Choose from TXT, SRT, VTT, or JSON formats
   - Files include both original and restyled text

### Advanced Features

#### Custom Prompts
Use template variables in your prompts:
- `{{style}}` - The selected style preset
- `{{outlang}}` - Output language selection
- `{{currentLine}}` - The line being processed
- `{{prevLines}}` - Context from previous lines
- `{{nextLines}}` - Context from following lines

Example custom prompt:
```
Rewrite this transcript line to be {{style}} in {{outlang}}. 
Maintain the original meaning while improving clarity.

Previous context: {{prevLines}}
Current line: {{currentLine}}
Next context: {{nextLines}}
```

#### ASCII Sanitization
When enabled, this feature:
- Removes accented characters and special symbols
- Applies OpenAI logit bias to prevent Unicode output
- Uses a customizable blocklist for additional characters
- Helpful for systems that don't support Unicode properly

#### Language Preferences
Set preferred languages (comma-separated) to automatically sort transcript tracks:
```
en,es,fr,de,ja
```

#### Preset Management
- Save current settings as named presets
- Export presets as JSON files for sharing
- Import presets from JSON files
- Useful for different use cases or sharing team configurations

## 🎨 Customization

### Themes
- **Dark**: Default dark theme optimized for low-light usage
- **Light**: Clean light theme for bright environments  
- **System**: Automatically matches your system theme preference

### Overlay Position
- Drag the overlay by clicking and dragging the header
- Position is automatically saved and restored
- Resize using the corner handle (bottom-right)

### Style Presets
Choose from built-in presets or create custom ones:
- **Clean & Professional**: Formal, clear language
- **Casual & Conversational**: Relaxed, friendly tone
- **Academic & Formal**: Scholarly, precise language
- **Creative & Engaging**: Dynamic, interesting phrasing
- **Technical & Precise**: Detailed, accurate terminology

## 🔍 Troubleshooting

### Common Issues

#### "No transcript data loaded"
- Ensure the video has captions available
- Try different language tracks
- Some videos may not have captions

#### "API key required" or authentication errors
- Verify your API key is correct and active
- Check that your account has sufficient credits/quota
- Ensure the base URL is correct for your provider

#### TTS generation fails
- Verify TTS provider settings
- Check API key and region (for Azure)
- Try reducing text length for large transcripts

#### Extension not appearing
- Refresh the YouTube page
- Check that the extension is enabled in Chrome
- Verify you're on a YouTube watch page (not homepage)

### Debug Mode
Enable debug logging to troubleshoot issues:
1. Check "Debug Logging" in the overlay header
2. Open Chrome DevTools (F12)
3. Check the Console tab for detailed logs
4. Look for messages prefixed with `[YTS-UI]` or `[YTS-BG]`

### Performance Tips
- Use lower concurrency (1-3) for rate-limited APIs
- Break large transcripts into smaller segments
- Enable ASCII-only mode to reduce processing complexity
- Close other browser tabs to free up memory

## 🔐 Privacy & Security

### Data Handling
- **API Keys**: Stored in memory only, never persisted to disk
- **Transcripts**: Processed locally, sent to chosen LLM provider only
- **Preferences**: Saved locally using Chrome's storage API
- **No Telemetry**: Extension doesn't collect or transmit usage data

### API Provider Considerations
- OpenAI: Data may be used for training unless opted out
- Anthropic: Data not used for training by default
- Local Models: Data stays completely local

### Permissions Explained
- `storage`: Save preferences and presets locally
- `<all_urls>`: Required to fetch YouTube transcripts and call various APIs

## 🛠️ Development

### Building from Source
```bash
# Clone the repository
git clone https://github.com/helix4u/Transcripts-Styler.git
cd Transcripts-Styler

# Install dependencies (if any)
npm install

# Load in Chrome for testing
# Follow installation instructions above
```

### File Structure
```
Transcripts-Styler/
├── manifest.json          # Extension manifest
├── background.js          # Service worker (API handling)
├── content.js            # Content script (UI and logic)
├── overlay.css           # Styling and themes
├── README.md             # This file
└── docs/
    ├── SCRATCHPAD.md     # Development notes
    └── TODO.md           # Feature roadmap
```

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 Changelog

### v0.4.0-test (Current)
- ✅ Comprehensive TTS support (OpenAI, Azure, Browser, Custom)
- ✅ ASCII sanitization with OpenAI logit bias
- ✅ Enhanced theming system
- ✅ Debug logging and troubleshooting tools
- ✅ Improved error handling and user feedback
- ✅ Preset management system
- ✅ Multi-language support and preferences

### v0.3.0
- ✅ Added customization options and language preferences
- ✅ Preset save/export/import functionality
- ✅ Theme support (dark/light/system)
- ✅ Enhanced UI with better organization

### v0.2.0
- ✅ Multiple LLM provider support
- ✅ Improved transcript parsing
- ✅ Basic TTS functionality
- ✅ Export capabilities

### v0.1.0
- ✅ Initial release
- ✅ Basic transcript extraction
- ✅ Simple OpenAI integration
- ✅ Core UI framework

## 🔮 Roadmap

### Planned Features
- [ ] Batch processing for multiple videos
- [ ] Integration with more TTS providers
- [ ] Japanese language enhancements (furigana, pitch accents)
- [ ] Collaborative features and sharing
- [ ] Chrome Web Store publication
- [ ] Firefox extension port

### Under Consideration
- [ ] Video timestamp synchronization
- [ ] Subtitle overlay on video player
- [ ] Integration with note-taking apps
- [ ] API for third-party integrations

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Support

### Getting Help
- Check the troubleshooting section above
- Enable debug logging for detailed error information
- Search existing [GitHub issues](https://github.com/helix4u/Transcripts-Styler/issues)
- Create a new issue with detailed information

### Reporting Bugs
Please include:
- Chrome version and operating system
- Extension version
- Steps to reproduce the issue
- Console logs (with debug mode enabled)
- Screenshot if applicable

### Feature Requests
- Check existing issues first
- Describe the use case and expected behavior
- Consider contributing if you have development skills

## 🙏 Acknowledgments

- YouTube for providing transcript APIs
- OpenAI, Anthropic, and other AI providers
- The Chrome extension development community
- All contributors and testers

---

**Note**: This extension is not affiliated with any platform providers, Google, OpenAI, or Anthropic. It's an independent tool designed to enhance content viewing experiences through AI-powered transcript processing.
