# Welcome to your Rork app

## Project info

This is a native cross-platform mobile app created with [Rork](https://rork.com)

**Platform**: Native iOS app, exportable to web
**Framework**: Expo Router + React Native

## How can I edit this code?

There are several ways of editing your native mobile application.

### **Use Rork**

Simply visit [rork.com](https://rork.com) and prompt to build your app with AI.

Changes made via Rork will be committed automatically to this GitHub repo.

Whenever you make a change in your local code editor and push it to GitHub, it will be also reflected in Rork.

### **Use your preferred code editor**

If you want to work locally using your own code editor, you can clone this repo and push changes. Pushed changes will also be reflected in Rork.

If you are new to coding and unsure which editor to use, we recommend Cursor. If you're familiar with terminals, try Claude Code.

The only requirement is having Node.js & Bun installed - [install Node.js with nvm](https://github.com/nvm-sh/nvm) and [install Bun](https://bun.sh/docs/installation)

Follow these steps:

```bash
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
bun i

# Step 4: Start the instant web preview of your Rork app in your browser, with auto-reloading of your changes
bun run start-web

# Step 5: Start iOS preview
# Option A (recommended):
bun run start  # then press "i" in the terminal to open iOS Simulator
# Option B (if supported by your environment):
bun run start -- --ios
```

### **Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

## NEXUS Architecture Reference

For a detailed specification of the NEXUS cognitive system architecture used in this project, see [`docs/NEXUS_COGNITIVE_FRAMEWORK_ARCHITECTURE.md`](docs/NEXUS_COGNITIVE_FRAMEWORK_ARCHITECTURE.md).

## What technologies are used for this project?

This project is built with the most popular native mobile cross-platform technical stack:

- **React Native** - Cross-platform native mobile development framework created by Meta and used for Instagram, Airbnb, and lots of top apps in the App Store
- **Expo** - Extension of React Native + platform used by Discord, Shopify, Coinbase, Telsa, Starlink, Eightsleep, and more
- **Expo Router** - File-based routing system for React Native with support for web, server functions and SSR
- **TypeScript** - Type-safe JavaScript
- **React Query** - Server state management
- **Lucide React Native** - Beautiful icons

## How can I test my app?

### **On your phone (Development Build)**

1. Build and install a development client on your device (see **Creating a Custom Development Build** below).
2. Start Metro in dev-client mode with `bun run start` (or `bun run start-tunnel` for remote devices).
3. Open the installed development build and connect to the running project.

### **In your browser**

Run `bun start-web` to test in a web browser. Note: The browser preview is great for quick testing, but some native features may not be available.

### **iOS Simulator**

This project is configured to use **Expo Development Builds** instead of Expo Go, so native modules and config plugins always match your runtime.

If you have XCode installed:

```bash
# iOS Simulator
bun run start -- --ios

```

## How can I deploy this project?

### **Publish to App Store (iOS)**

### **Local iOS production builds (`--local`)**

`eas build --platform ios --local` requires **fastlane** to be installed on your machine and available in `PATH`.

This repository is configured for **local iOS credentials** (`eas.json` uses `ios.credentialsSource=local`) to avoid remote certificate import failures such as:

`Distribution certificate ... hasn't been imported successfully`.

Create a `credentials.json` file in the project root before running local iOS builds.

The local build preflight now validates that your `.p12` and provisioning profile are readable before invoking EAS, so credential corruption/password mismatches fail fast with actionable errors.

```bash
# RubyGem option
sudo gem install fastlane

# Homebrew option
brew install fastlane
```

If you hit npm cache permission errors after using `sudo npm`, avoid writing to `~/.npm` by using the repo-local cache scripts:

```bash
npm run build:prod:ios:local:clean
npm run build:prod:ios:local:repair
```

The repair script only touches `.npm-cache` in this project, so it won't require changing ownership of your home npm cache.

1. **Configure your project**:

   ```bash
   npx eas build:configure
   ```

2. **Build for iOS**:

   ```bash
   npx eas build --platform ios
   ```

3. **Submit to App Store**:
   ```bash
   npx eas submit --platform ios
   ```

For detailed instructions, visit [Expo's App Store deployment guide](https://docs.expo.dev/submit/ios/).

### **Publish as a Website**

Your React Native app can also run on the web:

1. **Build for web**:

   ```bash
   npx eas build --platform web
   ```

2. **Deploy with EAS Hosting**:
   ```bash
   npx eas hosting:configure
   npx eas hosting:deploy
   ```

Alternative web deployment options:

- **Vercel**: Deploy directly from your GitHub repository
- **Netlify**: Connect your GitHub repo to Netlify for automatic deployments

## App Features

This template includes:

- **Cross-platform compatibility** - Works on iOS and Web
- **File-based routing** with Expo Router
- **Tab navigation** with customizable tabs
- **Modal screens** for overlays and dialogs
- **TypeScript support** for better development experience
- **Async storage** for local data persistence
- **Vector icons** with Lucide React Native

## Project Structure

```
├── app/                    # App screens (Expo Router)
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── _layout.tsx    # Tab layout configuration
│   │   └── index.tsx      # Home tab screen
│   ├── _layout.tsx        # Root layout
│   ├── modal.tsx          # Modal screen example
│   └── +not-found.tsx     # 404 screen
├── assets/                # Static assets
│   └── images/           # App icons and images
├── constants/            # App constants and configuration
├── app.json             # Expo configuration
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## Custom Development Builds

This repository is set up for Custom Development Builds as the default development workflow.

### **When do you need a Custom Development Build?**

- **Native Authentication**: Face ID, Touch ID, Apple Sign In, Google Sign In
- **In-App Purchases**: App Store and Google Play subscriptions
- **Advanced Native Features**: Third-party SDKs, platform-specific features (e.g. Widgets on iOS)
- **Background Processing**: Background tasks, location tracking

### **Creating a Custom Development Build**

```bash
# Install EAS CLI
bun i -g @expo/eas-cli

# iOS development client
bun run build:dev:ios

# Start Metro for development build
bun run start
```

**Learn more:**

- [Development Builds Introduction](https://docs.expo.dev/develop/development-builds/introduction/)
- [Creating Development Builds](https://docs.expo.dev/develop/development-builds/create-a-build/)
- [Installing Development Builds](https://docs.expo.dev/develop/development-builds/installation/)

## Advanced Features

### **Add a Database**

Integrate with backend services:

- **Supabase** - PostgreSQL database with real-time features
- **Firebase** - Google's mobile development platform
- **Custom API** - Connect to your own backend

### **Add Authentication**

Implement user authentication:

**Basic Authentication (works in development builds and web):**

- **Expo AuthSession** - OAuth providers (Google, Facebook, Apple) - [Guide](https://docs.expo.dev/guides/authentication/)
- **Supabase Auth** - Email/password and social login - [Integration Guide](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native)
- **Firebase Auth** - Comprehensive authentication solution - [Setup Guide](https://docs.expo.dev/guides/using-firebase/)

**Native Authentication (requires Custom Development Build):**

- **Apple Sign In** - Native Apple authentication - [Implementation Guide](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- **Google Sign In** - Native Google authentication - [Setup Guide](https://docs.expo.dev/guides/google-authentication/)

### **Add Push Notifications**

Send notifications to your users:

- **Expo Notifications** - Cross-platform push notifications
- **Firebase Cloud Messaging** - Advanced notification features

### **Add Payments**

Monetize your app:

**Web & Credit Card Payments (works in development builds and web):**

- **Stripe** - Credit card payments and subscriptions - [Expo + Stripe Guide](https://docs.expo.dev/guides/using-stripe/)
- **PayPal** - PayPal payments integration - [Setup Guide](https://developer.paypal.com/docs/checkout/mobile/react-native/)

**Native In-App Purchases (requires Custom Development Build):**

- **RevenueCat** - Cross-platform in-app purchases and subscriptions - [Expo Integration Guide](https://www.revenuecat.com/docs/expo)
- **Expo In-App Purchases** - Direct App Store/Google Play integration - [Implementation Guide](https://docs.expo.dev/versions/latest/sdk/in-app-purchases/)

**Paywall Optimization:**

- **Superwall** - Paywall A/B testing and optimization - [React Native SDK](https://docs.superwall.com/docs/react-native)
- **Adapty** - Mobile subscription analytics and paywalls - [Expo Integration](https://docs.adapty.io/docs/expo)

## I want to use a custom domain - is that possible?

For web deployments, you can use custom domains with:

- **EAS Hosting** - Custom domains available on paid plans
- **Netlify** - Free custom domain support
- **Vercel** - Custom domains with automatic SSL

For mobile apps, you'll configure your app's deep linking scheme in `app.json`.

## Troubleshooting

### **App not loading on device?**

1. Make sure your phone and computer are on the same WiFi network
2. Try using tunnel mode: `bun run start-tunnel`
3. Check if your firewall is blocking the connection

### **Build failing?**

1. Clear your cache: `npx expo start --clear`
2. Delete `node_modules` and reinstall: `rm -rf node_modules && bun install`
3. Check [Expo's troubleshooting guide](https://docs.expo.dev/troubleshooting/build-errors/)

### **EAS local iOS build fails with npm `EEXIST` / cache permission errors?**

When `eas build --local` invokes `eas-cli-local-build-plugin`, it uses npm under the hood. On some machines, a shared/global npm cache can fail with errors like `EEXIST`, `EACCES`, or rename failures in `~/.npm/_cacache`.

Run the local build with an isolated project cache:

1. `npm run build:prod:ios:local`
2. If the project cache is corrupted, run: `npm run build:prod:ios:local:clean`
3. If you still get `EEXIST` / `EACCES` rename errors, run: `npm run build:prod:ios:local:repair` (note: this also clears the shared npm tarball cache at `~/.npm/_cacache`; subsequent installs in other projects will re-download packages).

These scripts set `NPM_CONFIG_CACHE=.npm-cache`, and the `:repair` variant also removes the global npm content cache (`~/.npm/_cacache`). This avoids permission collisions during local EAS builds.

### **EAS local iOS build fails with certificate import errors?**

If you see this during `npm run build:prod:ios:local*`:

`Distribution certificate with fingerprint ... hasn't been imported successfully`

run:

1. `node ./scripts/validate-ios-local-credentials.mjs`
2. Re-download credentials from EAS: `eas credentials -p ios` → `credentials.json: Download credentials from EAS to credentials.json`
3. Retry with a clean local cache: `npm run build:prod:ios:local:repair`

If validation still fails, the local `.p12` password in `credentials.json` or certificate payload is invalid/corrupted. Regenerate the iOS distribution certificate/profile and download credentials again.

### **Need help with native features?**

- Check [Expo's documentation](https://docs.expo.dev/) for native APIs
- Browse [React Native's documentation](https://reactnative.dev/docs/getting-started) for core components
- Visit [Rork's FAQ](https://rork.com/faq) for platform-specific questions

## About Rork

Rork builds fully native mobile apps using React Native and Expo - the same technology stack used by Discord, Shopify, Coinbase, Instagram, and nearly 30% of the top 100 apps on the App Store.

Your Rork app is production-ready and can be published to both the App Store and Google Play Store. You can also export your app to run on the web, making it truly cross-platform.

## Native Development Build Diagnostics (iOS)

A new **Device** tab runs native readiness checks that only work in Expo development builds:

- Build/runtime metadata (`expo-application`)
- Device identity (`expo-device`)
- Biometric hardware/enrollment (`expo-local-authentication`)
- Encrypted keychain/keystore probe (`expo-secure-store`)
- Clipboard export for bug reports (`expo-clipboard`)

### iOS development build (Xcode)

1. Install dependencies: `npm install`
2. Generate native ios project: `npx expo prebuild --platform ios`
3. Open `ios/*.xcworkspace` in Xcode and set a Team in Signing & Capabilities.
4. Build and run to device.

### iOS ad-hoc sideloading path (AltStore / manual IPA)

1. Build a device binary with EAS development profile: `npx eas build --platform ios --profile development`
2. Download the produced `.ipa` from EAS build artifacts.
3. Install with AltStore (or Apple Configurator / Xcode Devices).
4. Launch and use the **Device** tab to verify on-device native capability availability.

## Native Capability Hub (iOS Dev Builds)

The **Device** tab now includes a full native capability hub for on-device testing:

- Local vector database with semantic lookup (`expo-sqlite`)
- Encrypted local storage (`expo-secure-store`)
- Audio permissions and native TTS (`expo-audio` + `expo-speech`)
- Native STT capture (`expo-speech-recognition`)
- GPS retrieval (`expo-location`) with native map rendering (`react-native-maps`)
- Calendar event creation (`expo-calendar`)
- Contacts read probe (`expo-contacts`)
- Phone and SMS launch (`tel:` and `sms:` deep links)

### iOS Xcode setup for full native runtime

```bash
npm install
npx expo prebuild --platform ios
npx expo run:ios --device
```

Make sure your Apple Team is configured in Xcode Signing & Capabilities.

### CocoaPods `PBXFileReference#new_file` troubleshooting

If `npx expo prebuild --platform ios` fails during `pod install` with:

`NoMethodError - undefined method 'new_file' for PBXFileReference`

use the built-in doctor flow:

```bash
npm run ios:prebuild:doctor
```

This workflow will:

1. Detect the CocoaPods binary currently on PATH.
2. Install and activate CocoaPods `1.15.2` in user gems when a different version is active.
3. Run `expo prebuild --no-install` so pod installation can be executed with a pinned CocoaPods version.
4. Generate `ios/.ruby-version` and `ios/Gemfile` and execute `bundle exec pod install --verbose`.

If the error still occurs, isolate custom pods by temporarily removing local native modules (start with `expo-coreml-llm`), then add them back one at a time until the failure reproduces.

To automate this workflow, run:

```bash
npm run ios:prebuild:doctor -- --auto-isolate-custom-pods
```

You can customize the module isolation order with a comma-separated list:

```bash
CUSTOM_POD_MODULES=expo-coreml-llm,another-module npm run ios:prebuild:doctor -- --auto-isolate-custom-pods
```

### AltStore / ad-hoc sideload workflow

```bash
npx eas build --platform ios --profile development
```

Install the `.ipa` using AltStore or Apple Configurator and run diagnostics on a physical device.

### CoreML pipeline (download → validate → build)

Use the manifest-driven pipeline to keep model assets, tokenizer files, and runtime defaults aligned.

```bash
# Download model + tokenizer declared in coreml-config.json
npm run coreml:fetch

# Validate manifest + bundled assets before prebuild / EAS build
npm run coreml:validate -- --strict

# Optional deep inspection (requires coremltools):
npm run coreml:inspect
```

For deep CoreML graph/introspection checks, install `coremltools` locally:

```bash
python3 -m pip install --upgrade coremltools
```

Recommended flow for iOS dev/sideload builds:

1. `npm run coreml:fetch`
2. `npm run coreml:validate -- --strict`
3. `npx expo prebuild --platform ios`
4. Build via Xcode (`npx expo run:ios --device`) or EAS (`npx eas build --platform ios --profile development`)
5. Install IPA through AltStore / Apple Configurator for on-device verification.

Tokenizer note: Llama 3.2 uses a byte-level BPE tokenizer. In this codebase, `byte_level_bpe` is the canonical tokenizer kind, while `gpt2_bpe` remains a backward-compatible alias for existing configs.

If you see `Failed to build the model execution plan ... model.mil ... error code: -4`, try:

- Switching `computeUnits` in `coreml-config.json` to `cpuOnly` for compatibility testing.
- Using a smaller or more compatible CoreML variant.
- Re-exporting/regenerating the model for your iOS/CoreML runtime version.
