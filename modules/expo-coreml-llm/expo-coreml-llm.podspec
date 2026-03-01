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
  # Require newer iOS version for APIs used in Swift (MLState, cpuAndNeuralEngine)
  s.platforms    = { :ios => '18.0' }
  s.source       = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'

  # CocoaPods 1.15+ can fail when directory entries are added as PBX file refs.
  # Filter glob results to files so extensionless assets are preserved while
  # excluding directories such as *.mlpackage bundles from PBX file references.
  resource_files = Dir.glob('ios/resources/**/*').select { |path| File.file?(path) }
  s.resource_bundles = {
    'ExpoCoreMLLLMResources' => resource_files
  }
end
