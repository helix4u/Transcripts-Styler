# Transcript Styler - Installation Guide

## Quick Start

### 1. Download the Extension
```bash
# Option A: Clone from repository
git clone https://github.com/helix4u/Transcripts-Styler.git
cd Transcripts-Styler

# Option B: Download ZIP and extract
# Download the ZIP file and extract to a folder
```

### 2. Load in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" 
4. Select the `Transcripts-Styler` folder
5. The extension should appear in your extensions list

### 3. Verify Installation
1. Navigate to any YouTube video with captions (more platforms coming soon)
2. Look for the overlay in the top-left corner
3. Click "Detect" to auto-detect the video ID
4. Click "List Tracks" to see available captions

## Configuration

### Set Up API Keys
1. **OpenAI**: Get API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. **Anthropic**: Get API key from [Anthropic Console](https://console.anthropic.com/)
3. **Azure Speech**: Get key from [Azure Portal](https://portal.azure.com/)

### Configure Providers
1. Select your preferred LLM provider in the overlay
2. Enter your API key (stored in memory only)
3. Set the base URL and model name
4. Choose concurrency level (1-10 parallel requests)

## First Use

### Extract a Transcript
1. Go to a YouTube video with captions
2. Click "Detect" to get the video ID
3. Click "List Tracks" to see available languages
4. Select your preferred track
5. Click "Fetch Transcript"

### Restyle with AI
1. Configure your LLM provider
2. Choose a style preset or create custom prompt
3. Click "Restyle All" to begin processing
4. Monitor progress and use "Stop" if needed

### Generate TTS (Optional)
1. Enable TTS and select provider
2. Configure voice settings
3. Click "Generate TTS"
4. Play audio or download file

### Export Results
1. Click any export button (TXT, SRT, VTT, JSON)
2. Files include both original and restyled text
3. Downloads start automatically

## Troubleshooting

### Extension Not Loading
- Ensure you're using Chrome 88+ 
- Check that "Developer mode" is enabled
- Try refreshing the extensions page
- Check Chrome console for errors

### Overlay Not Appearing
- Refresh the YouTube page
- Ensure you're on a video watch page (not homepage)
- Check that the extension is enabled
- Look in the top-left corner of the page

### API Errors
- Verify your API key is correct and active
- Check that you have sufficient credits/quota
- Ensure the base URL is correct
- Try reducing concurrency to 1

### No Transcript Available
- Not all videos have captions
- Try different language tracks
- Some auto-generated captions may be limited
- Check if the video is age-restricted

### TTS Issues
- Verify TTS provider settings
- Check API key and region (for Azure)
- Try reducing text length
- Test with browser TTS first

## Development

### For Developers
```bash
# Install development dependencies
npm install

# Run linting
npm run lint

# Format code
npm run format

# Build for distribution
npm run build

# Package extension
npm run package
```

### Debug Mode
1. Enable "Debug Logging" in the overlay header
2. Open Chrome DevTools (F12)
3. Check Console for detailed logs
4. Look for messages prefixed with `[YTS-UI]` or `[YTS-BG]`

## Support

### Getting Help
- Check the [README.md](README.md) for detailed documentation
- Enable debug logging for error details
- Search [GitHub Issues](https://github.com/yourusername/youtube-transcript-styler/issues)
- Create a new issue with:
  - Chrome version and OS
  - Extension version
  - Steps to reproduce
  - Console logs
  - Screenshot if applicable

### Feature Requests
- Check existing issues first
- Describe the use case clearly
- Include expected behavior
- Consider contributing if you have development skills

## Security Notes

- API keys are stored in memory only (never saved to disk)
- Transcripts are only sent to your chosen LLM provider
- No telemetry or data collection
- All processing happens locally or via your chosen APIs

## Next Steps

1. **Basic Use**: Extract and export transcripts
2. **AI Enhancement**: Set up LLM provider for restyling  
3. **Audio Generation**: Configure TTS for voice output
4. **Customization**: Create presets and themes
5. **Advanced**: Custom prompts and language preferences

---

**Need Help?** Check the [README.md](README.md) for comprehensive documentation or create an issue on GitHub.

**Version**: 0.4.0-test  
**Last Updated**: September 20, 2025
