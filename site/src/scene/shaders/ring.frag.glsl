uniform vec3 uColorLow;
uniform vec3 uColorHigh;
uniform vec3 uColorHot;
uniform float uOpacity;

varying float vGlow;
varying float vLevel;
varying float vY;

void main() {
  vec3 c = mix(uColorLow, uColorHigh, vLevel);
  c = mix(c, uColorHot, vGlow);
  // Brighter toward the top of each bar for a lit-from-above feel.
  c *= 0.7 + 0.4 * vY + 0.45 * vGlow;
  float a = uOpacity * (0.35 + 0.65 * vLevel + vGlow);
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
}
