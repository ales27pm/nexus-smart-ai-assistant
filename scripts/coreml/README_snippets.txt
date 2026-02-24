HF CLI install (official docs):
  - curl -fsSL https://huggingface.co/install.sh | bash  (review script before executing)
  - recommended: python3 -m pip install -U huggingface_hub
Then:
  hf download <repo_id> ...  [oai_citation:4‡Hugging Face](https://huggingface.co/docs/huggingface_hub/en/guides/cli)

Expo local credentials (official docs):
  - credentials.json includes provisioningProfilePath + distributionCertificate.path/password
  - eas.json build profile should set credentialsSource: "local"  [oai_citation:5‡Expo Documentation](https://docs.expo.dev/app-signing/local-credentials/)
