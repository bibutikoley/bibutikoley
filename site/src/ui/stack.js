import { h, clear, $ } from '../util/dom.js';

const GROUPS = [
  ['Mobile', ['Kotlin', 'Swift', 'Jetpack Compose', 'SwiftUI', 'Kotlin Multiplatform', 'Flutter']],
  ['Voice & AI', ['Whisper', 'Parakeet', 'Qwen3-ASR', 'Kokoro', 'LiveKit', 'WebRTC', 'Ollama', 'ONNX', 'PyTorch']],
  ['Backend & tools', ['Python', 'FastAPI', 'Docker', 'Firebase', 'Gradle', 'Git']],
];

export function renderStack(data) {
  const root = $('#languages');
  clear(root);
  const langs = (data.languages || []).slice(0, 6);
  const bar = h('div', { class: 'languages__bar', role: 'img', 'aria-label': 'Language share' });
  const list = h('ul', { class: 'languages__list' });
  langs.forEach((lang, i) => {
    bar.append(h('span', { style: { width: `${lang.pct}%`, background: lang.color, '--i': i } }));
    list.append(h('li', {}, h('i', { style: { background: lang.color } }), h('b', {}, lang.name), ` ${lang.pct}%`));
  });
  root.append(bar, list);

  const chips = $('#chips');
  clear(chips);
  for (const [title, items] of GROUPS) {
    chips.append(
      h('div', { class: 'chipgroup' }, h('h3', {}, title), h('ul', { class: 'chips' }, items.map((t) => h('li', {}, t)))),
    );
  }
}
