require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = package['name']
  s.version      = package['version']
  s.summary      = 'Test-only diagnostics module for CoreML bridge resilience validation.'
  s.description  = 'Provides controllable delay and structured native error injection for debug/e2e tests.'
  s.homepage     = 'https://example.invalid'
  s.license      = { :type => 'MIT' }
  s.author       = { 'local' => 'local' }
  s.platforms    = { :ios => '15.1' }
  s.source       = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
