require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = package['name']
  s.version      = package['version']
  s.summary      = 'On-device Core ML LLM runner (iOS) for Expo'
  s.description  = 'Runs a Core ML language model on-device and exposes a JS API through Expo Modules.'
  s.homepage     = 'https://example.invalid'
  s.license      = { :type => 'MIT' }
  s.author       = { 'local' => 'local' }
  s.platforms    = { :ios => '15.0' }
  s.source       = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'

  # CocoaPods 1.15+ can fail when directory entries are added as PBX file refs.
  # Match only files to avoid creating duplicate group references.
  s.resource_bundles = {
    'ExpoCoreMLLLMResources' => ['ios/resources/**/*.*']
  }
end
