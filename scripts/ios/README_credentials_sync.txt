Automated iOS credential sync (fastlane)
=======================================

Script:
  ./scripts/ios/sync_apple_credentials_fastlane.sh

Example:
  P12_PASSWORD='...' ./scripts/ios/sync_apple_credentials_fastlane.sh \
    --bundle-id com.example.app \
    --apple-id dev@example.com \
    --team-id 1A2BC3D4E5 \
    --type appstore

Outputs:
  - credentials/ios/dist-cert.p12
  - credentials/ios/profile.mobileprovision
  - credentials.json

Version minimums for local iOS packaging/export consistency:
  - Xcode: 15.4+ (xcodebuild/export pipeline aligned with current Apple export method semantics)
  - fastlane: 2.222.0+ (compatible with recent Xcode and App Store Connect export flow)
  - eas-cli: 18.1.0+ (local iOS export emits `app-store-connect` instead of deprecated `app-store`)

Notes:
  - Requires macOS + fastlane.
  - If keychain private-key export prompts, allow access.
  - If login is interactive, create FASTLANE_SESSION first for CI/non-interactive use.
  - Validate local toolchain before exporting: ./scripts/check-ios-local-build-env.sh
