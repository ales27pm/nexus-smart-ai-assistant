# NEXUS Cognitive Framework: System Architecture Specification

## 1. Architectural Philosophy and Framework Overview

The NEXUS cognitive framework is a high-fidelity architecture designed to mitigate the volatility of stateless inference inherent in traditional Large Language Model (LLM) deployments. By implementing a persistent Cognition-as-a-Service layer, NEXUS transitions from reactive prompt-response cycles to a multi-dimensional cognitive state. For architects building agentic systems, this provides a stable substrate for long-term user alignment and deterministic execution.

The framework is predicated on three core architectural pillars:

- **Multi-Dimensional Memory System**: A non-linear graph-based repository for long-term persistence and context-aware retrieval.
- **Tool Orchestration Layer**: A type-safe execution environment that bridges the cognitive core with the external world.
- **Native iOS Integration Tier**: A hardware-accelerated bridge enabling quantized on-device inference and local capability access.

NEXUS prioritizes an "On-Device First" approach, utilizing local CoreML execution to optimize for privacy, minimize latency, and ensure system reliability in offline environments. These pillars converge to drive a continuous cognitive loop—transitioning from Candidate Extraction to Associative Linking and Semantic Retrieval—creating a self-reinforcing system that matures through interaction.

## 2. Multi-Dimensional Memory Architecture

NEXUS utilizes a non-linear memory system to maintain long-term user alignment. By moving beyond flat-file chat histories, the architecture enables sophisticated reasoning where the agent's internal state evolves dynamically based on the relevance and reinforcement of information.

### 2.1 The Memory Entry Schema

The `MemoryEntry` data structure is the fundamental unit of the NEXUS memory bank. Metadata fields are utilized to drive precision in the retrieval-augmented generation (RAG) pipeline.

| Field              | Technical Definition                                                 |
| ------------------ | -------------------------------------------------------------------- |
| `id`               | Unique UUID for the memory entry.                                    |
| `content`          | The core string of information or extracted fact.                    |
| `keywords`         | A collection of 3-6 strings for rapid indexing and matching.         |
| `category`         | The taxonomic classification (e.g., `preference`, `fact`).           |
| `timestamp`        | Unix epoch time of the memory's creation.                            |
| `importance`       | Integer (1-5) dictating priority during context-window optimization. |
| `accessCount`      | Frequency of retrieval used to calculate reinforcement.              |
| `lastAccessed`     | Timestamp of the most recent retrieval event.                        |
| `decay`            | Floating-point value (1.0 to 0) representing temporal strength.      |
| `activationLevel`  | Readiness of the memory to be triggered by the current context.      |
| `contextSignature` | A unique hash identifying the environmental state during storage.    |

### 2.2 Categorical Taxonomy: “So What?” Analysis

The framework utilizes nine specific categories, each exerting a unique influence on prompt reconstruction:

1. **Preference**: Injected into the system prompt prefix to enforce stylistic and functional constraints without requiring user repetition.
2. **Fact**: Provides a ground-truth repository to reduce hallucinations during knowledge retrieval tasks.
3. **Instruction**: Weighted as high-importance system overrides to maintain task-specific guardrails and behavioral constraints.
4. **Context**: Informs the agent of the user's current environment (e.g., location or active project) for situational awareness.
5. **Goal**: Maintains the “North Star” for the agent, ensuring multi-turn interactions remain aligned with long-term objectives.
6. **Persona**: Dictates the relationship dynamics and linguistic style the AI adopts relative to the user.
7. **Skill**: Tracks assigned or learned capabilities, allowing the agent to self-select appropriate tools for a given task.
8. **Entity**: Stores structured data about people, places, or objects to maintain a coherent knowledge graph.
9. **Episodic**: Captures specific event sequences to provide narrative continuity across disparate conversation sessions.

### 2.3 Memory Lifecycle Dynamics

The lifecycle begins with Candidate Extraction, where the system identifies significant data points from user/assistant exchanges. Each entry is assigned an importance rating (1-5). During context-window optimization, high-importance memories are prioritized to ensure critical user goals are never purged, even as the conversation length increases.

### 2.4 Temporal Decay and Reinforcement

NEXUS implements a dynamic decay model via the `reinforceMemory` function. The system monitors `lastAccessed` and `accessCount` to update a memory's state across four distinct thresholds:

- **Strong** (`decay > 0.8`): Immediate priority for recall; considered core knowledge.
- **Active** (`decay > 0.5`): Standard recall priority; requires periodic reinforcement.
- **Fading** (`decay > 0.2`): Reduced priority; eligible for archival if not accessed.
- **Weak** (`decay < 0.2`): Candidates for pruning to minimize semantic noise.

## 3. Associative Reasoning and Semantic Linking

NEXUS moves beyond simple keyword matching by implementing a relational memory graph. This ensures that memories are no longer isolated nodes but part of a structured web of relevance.

### 3.1 Associative Link Construction and Maintenance

The `buildAssociativeLinks` process analyzes the memory bank during new entry creation to establish relationships between disparate nodes. This graph-based approach allows a single recalled memory to trigger related nodes, enriching the reasoning context. To maintain precision, `scheduleAssociativeLinkPruning` is used to remove weak or outdated links, preventing the semantic noise that often plagues large-scale RAG systems.

### 3.2 Semantic Vector Search

Retrieval is powered by a local vector database utilizing 64-dimension embeddings. The `recallMemory` tool employs a `cosineSimilarity` algorithm to ensure high-precision recall based on semantic meaning. This implementation supports a `categoryFilter` and `maxResults` parameter, allowing the agent to target specific data types (e.g., searching only for preferences) to optimize the context window.

## 4. Tool Orchestration and Cognitive Extension

The Tool Orchestration Layer transitions NEXUS from a conversational interface to an operational agent by enabling type-safe interactions with native modules.

### 4.1 The Rork Tool Framework

NEXUS utilizes Zod schemas for strict input validation. This architectural choice ensures that all LLM-generated tool calls are deterministic and type-safe, serving as the primary defense against hallucinated parameters during external execution.

### 4.2 Cognitive Toolset Analysis

High-value tools extend the agent's capabilities into complex reasoning:

- `deepAnalysis`: Facilitates structured reasoning using SWOT and Pros/Cons frameworks to evaluate multi-dimensional problems.
- `cognitiveAnalysis`: Implements Tree of Thought reasoning. This function allows the agent to explore multiple hypotheses simultaneously, assign confidence scores, and prune low-probability reasoning paths.
- `emotionalPulse`: Analyzes valence and arousal to adapt the agent’s response style through emotional mimicry.
- `admitUncertainty`: A strategic handler for low-confidence scenarios, allowing the agent to admit knowledge gaps and pivot to `webSearch` or user clarification.

### 4.3 High-Density Context Extraction

The `webSearch` and `webScrape` tools work in tandem to provide real-time enrichment. The scraper uses regex-based cleaning to strip `<script>` and `<style>` tags, providing the LLM with a high-density text-only context. This reduces token consumption while maximizing information gain.

## 5. Native iOS Integration and CoreML Execution

NEXUS leverages the hardware-level capabilities of iOS to perform local, private, and high-performance cognitive tasks.

### 5.1 On-Device LLM (CoreML)

The framework utilizes the `CoreMLLLMRunner` and `ExpoCoreMLLLMModule` to execute the `Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage`.

- **Quantization**: The `int4-lut` version ensures high-performance inference within the constraints of mobile hardware.
- **Tokenization**: The `GPT2Tokenizer` handles Byte Pair Encoding (BPE), ensuring stable encoding/decoding of model weights.
- **Health Monitoring**: The `DeviceNativeHub` provides real-time diagnostics on model loading status and system health.

### 5.2 Hardware Capability Abstraction

Native APIs are abstracted into tool-accessible functions:

- **Geospatial**: `getCurrentCoordinates` for GPS and map rendering.
- **Personal Data**: `getPrimaryContactSummary` and `createCalendarEvent` for native integration.
- **Audio Pipeline**: Managed via a Speech-to-Text (STT) and Text-to-Speech (TTS) pipeline. The system employs a `SILENCE_THRESHOLD_NATIVE` of `-35dB` to ensure reliable voice-mode termination and a responsive orb visualization for user feedback.

## 6. Implementation Maturity and Operational Security

NEXUS is engineered for production stability, prioritizing a fail-closed security posture.

### 6.1 Safety Protocols

The `urlSafety` logic provides a robust defense against malicious redirects. The system blocks all non-HTTPS links and explicitly nullifies `tel`, `javascript`, and `http` schemes. This ensures that external link interactions are handled through a secure, validated constructor.

### 6.2 Testing and Validation

The framework maintains architectural stability across iOS versions through a comprehensive testing suite:

- `coremlUtils.test.ts`: Ensures deterministic prompt building.
- `speechRecognition.test.ts`: Validates silence detection and transcript finalization.
- `urlSafety.test.ts`: Confirms the integrity of the fail-closed protocol.

### 6.3 Final Summary

The NEXUS architecture delivers a robust cognitive environment through three critical takeaways:

1. **Multi-Dimensional Persistence**: Implementation of a weighted, decaying, and reinforced relational graph for superior context management.
2. **Native Capability Access**: Direct hardware hooks into geospatial, audio, and personal data modules for real-world agency.
3. **Hardware-Accelerated On-Device Inference**: Quantized CoreML execution coupled with Tree of Thought reasoning to provide sophisticated cognition with mobile-native performance and privacy.
