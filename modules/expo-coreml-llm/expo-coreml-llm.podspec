require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  ios_deployment_target = '18.0'

  s.name         = package['name']
  s.version      = package['version']
  s.summary      = 'On-device Core ML LLM runner (iOS) for Expo'
  s.description  = 'Runs a Core ML language model on-device and exposes a JS API through Expo Modules.'
  s.homepage     = 'https://example.invalid'
  s.license      = { :type => 'MIT' }
  s.author       = { 'local' => 'local' }
  # Require newer iOS version for APIs used in Swift (MLState, cpuAndNeuralEngine)
  s.platforms    = { :ios => ios_deployment_target }
  s.source       = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'

  # CocoaPods 1.15+ can fail when directory entries are added as PBX file refs.
  # Filter glob results to files so extensionless assets are preserved while
  # excluding directories such as *.mlpackage bundles from PBX file references.
  # NOTE:
  # CocoaPods copies files inside a resource bundle by basename, not by the
  # original directory tree. If we include both tokenizer variants that contain
  # identical filenames (e.g. */vocab.json and */merges.txt), Xcode fails with:
  # "Multiple commands produce ... ExpoCoreMLLLMResources.bundle/vocab.json".
  # Include both tokenizer families while excluding legacy duplicate GPT-2
  # basenames that collide with byte_level_bpe files.
  legacy_duplicate_tokenizer_files = [
    'ios/resources/tokenizers/gpt2/vocab.json',
    'ios/resources/tokenizers/gpt2/merges.txt'
  ]
  resource_files = Dir.glob('ios/resources/**/*')
    .select { |path| File.file?(path) }
    .reject { |path| legacy_duplicate_tokenizer_files.include?(path) }
  s.resource_bundles = {
    'ExpoCoreMLLLMResources' => resource_files
  }
end
