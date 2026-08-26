# Bibuti Koley

**Mobile engineer building local-first voice AI**

I build mobile apps — Android, Kotlin Multiplatform, and lately SwiftUI — and I spend most of my
time now on voice interfaces that run **on the device instead of in someone else's cloud**:
speech recognition, language models, and text-to-speech stitched into pipelines that keep
sensitive conversations private.

---

## 🛠️ Featured Projects

<!-- PROJECTS:START -->

| Project | What it is | Stack |
| --- | --- | --- |
| [Livekit-VoiceBackend](https://github.com/bibutikoley/Livekit-VoiceBackend) | Local-first voice backend: FastAPI + a LiveKit agent worker running cascaded STT → LLM → TTS on-device, with a safety layer between understanding and speaking | **Python** |
| [Livekit-VoiceiOS](https://github.com/bibutikoley/Livekit-VoiceiOS) | SwiftUI chat app with voice mode inside the thread — live captions, AI disclosure, explicit GDPR Art 9 consent, and no model-provider secrets on the device | **Swift** |
| [voice-transcription](https://github.com/bibutikoley/voice-transcription) | Live microphone transcription in the terminal, with five swappable ASR backends and vocabulary biasing for clinical speech | **Python** |
| [auris-server](https://github.com/bibutikoley/auris-server) | Neural text-to-speech server built on Kokoro-82M, with a normalization pipeline that reads medical notation aloud correctly (BID → "twice a day") | **Python** |
| [NetworkConfig](https://github.com/bibutikoley/NetworkConfig) | Kotlin Multiplatform library for observing network connectivity in real time across Android and iOS | **Kotlin** |
| [bingo](https://github.com/bibutikoley/bingo) | This is a bingo game for android TV | **Kotlin** |

<!-- PROJECTS:END -->

<sub>This table refreshes daily from the GitHub API. Curated descriptions live in
<a href="data/projects.json"><code>data/projects.json</code></a>.</sub>

## 🎯 What I Work On

| Area | In practice |
| --- | --- |
| **On-device speech** | Streaming STT with voice activity detection, neural TTS, and vocabulary biasing for domain terms — Parakeet, Whisper, Qwen3-ASR, Kokoro |
| **Voice agent architecture** | Cascaded STT → LLM → TTS over WebRTC with LiveKit, one shared agent core serving both text and voice |
| **Privacy by construction** | Local models, no provider secrets on the device, short-lived scoped tokens, explicit consent before a microphone opens |
| **Mobile** | Jetpack Compose and SwiftUI, Kotlin Multiplatform for shared domain logic, clean architecture that survives feature growth |
| **Backends** | FastAPI services, Ollama-hosted models, retrieval and safety layers between understanding and speaking |

## 🧰 Tech Stack

**Languages**
![Kotlin](https://img.shields.io/badge/Kotlin-7F52FF?style=flat-square&logo=kotlin&logoColor=white)
![Swift](https://img.shields.io/badge/Swift-F05138?style=flat-square&logo=swift&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![Java](https://img.shields.io/badge/Java-ED8B00?style=flat-square&logo=openjdk&logoColor=white)
![Dart](https://img.shields.io/badge/Dart-0175C2?style=flat-square&logo=dart&logoColor=white)

**Mobile**
![Android](https://img.shields.io/badge/Android-3DDC84?style=flat-square&logo=android&logoColor=white)
![Jetpack Compose](https://img.shields.io/badge/Jetpack%20Compose-4285F4?style=flat-square&logo=jetpackcompose&logoColor=white)
![SwiftUI](https://img.shields.io/badge/SwiftUI-0071E3?style=flat-square&logo=swift&logoColor=white)
![Kotlin Multiplatform](https://img.shields.io/badge/Kotlin%20Multiplatform-7F52FF?style=flat-square&logo=kotlin&logoColor=white)
![Flutter](https://img.shields.io/badge/Flutter-02569B?style=flat-square&logo=flutter&logoColor=white)

**Voice & AI**
![LiveKit](https://img.shields.io/badge/LiveKit-1F1F1F?style=flat-square&logo=livekit&logoColor=white)
![Whisper](https://img.shields.io/badge/Whisper-412991?style=flat-square&logo=openai&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-000000?style=flat-square&logo=ollama&logoColor=white)
![PyTorch](https://img.shields.io/badge/PyTorch-EE4C2C?style=flat-square&logo=pytorch&logoColor=white)
![ONNX](https://img.shields.io/badge/ONNX-005CED?style=flat-square&logo=onnx&logoColor=white)

**Backend & Tools**
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Gradle](https://img.shields.io/badge/Gradle-02303A?style=flat-square&logo=gradle&logoColor=white)
![Git](https://img.shields.io/badge/Git-F05032?style=flat-square&logo=git&logoColor=white)

## 📈 GitHub Stats

<p align="left">
  <img alt="Bibuti's GitHub stats" src="assets/github-stats.svg" width="440" />
  <img alt="Most used languages" src="assets/top-languages.svg" width="440" />
</p>

<p align="left">
  <img alt="Contribution activity over the past year" src="assets/activity.svg" width="890" />
</p>

<sub>These cards are generated daily by
<a href=".github/workflows/profile-stats.yml">a GitHub Action</a> and committed to this
repository, so they render from GitHub itself rather than a third-party service.</sub>

## 📫 Reach Me

[![Website](https://img.shields.io/badge/Website-bibutikoley.github.io-181717?style=flat-square&logo=github&logoColor=white)](https://bibutikoley.github.io/)
[![Twitter](https://img.shields.io/badge/Twitter-@iambibuti-1DA1F2?style=flat-square&logo=x&logoColor=white)](https://twitter.com/iambibuti)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-bibutikoley-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/bibutikoley/)
[![Email](https://img.shields.io/badge/Email-bibutikoley@outlook.com-EA4335?style=flat-square&logo=maildotru&logoColor=white)](mailto:bibutikoley@outlook.com)

---

<sub>⚡ Ask me about on-device speech pipelines, Kotlin Multiplatform, or why your TTS mispronounces "120/80". Fun fact: I like listening to music 🎧</sub>
