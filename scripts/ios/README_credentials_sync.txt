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

Notes:
  - Requires macOS + fastlane.
  - If keychain private-key export prompts, allow access.
  - If login is interactive, create FASTLANE_SESSION first for CI/non-interactive use.
