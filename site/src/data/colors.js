// GitHub linguist colours for the languages that show up in this profile.
// Anything else falls back to the snapshot's colour or neutral grey.
const LINGUIST = {
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  Python: '#3572A5',
  Java: '#b07219',
  Dart: '#00B4AB',
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#663399',
  C: '#555555',
  'C++': '#f34b7d',
  Rust: '#dea584',
  Go: '#00ADD8',
  Ruby: '#701516',
  'Objective-C': '#438eff',
  Vue: '#41b883',
  Dockerfile: '#384d54',
  'Jupyter Notebook': '#DA5B0B',
};

export function languageColor(name, fallback) {
  return LINGUIST[name] || fallback || '#8b949e';
}
