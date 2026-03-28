# Smart AI Assistant (NEXUS)

## Overview
A mobile AI assistant app built with Expo (React Native) that connects to a local Llama server. The app features a chat interface, conversation history, memory extraction, and voice input capabilities.

## Architecture
- **Framework**: Expo (React Native) with Expo Router for file-based navigation
- **Language**: TypeScript
- **State**: React Query for server state, AsyncStorage for persistence
- **Location**: All code lives in the `expo/` directory

## Project Structure
```
expo/
  app/              # Expo Router screens
    (tabs)/         # Tab-based navigation
      (chat)/       # Chat interface
      history/      # Conversation history
      memory/       # Memory management
      settings/     # App settings
  components/       # Reusable UI components
  constants/        # Colors, theme
  hooks/            # Custom React hooks
  providers/        # React context providers
  utils/            # Utility functions
  assets/           # Images, fonts
```

## Key Features
- Chat interface with Llama LLM backend (configurable server URL)
- Conversation history with persistence
- Memory extraction and management
- Voice input via expo-speech / audio recording
- Dark theme UI

## Running the App
- **Workflow**: "Start application" runs `cd expo && npx expo start --web --port 5000`
- **Port**: 5000 (web preview)
- The Expo dev server supports hot module reloading

## Deployment
- **Target**: Static site
- **Build**: `cd expo && npx expo export --platform web`
- **Output**: `expo/dist`

## Configuration
- Llama server URL: configurable in Settings tab (default: `http://localhost:8080`)
- App config: `expo/app.json`
- Colors/theme: `expo/constants/colors.ts`
