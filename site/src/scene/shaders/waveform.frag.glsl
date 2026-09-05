uniform float uOpacity;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = smoothstep(0.5, 0.08, d);
  a *= a;
  gl_FragColor = vec4(vColor * (0.6 + 0.8 * a), a * vAlpha * uOpacity);
}
