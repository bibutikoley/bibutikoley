#include ./noise.glsl

uniform float uTime;
uniform float uAmp;
uniform float uMorph;
uniform float uHotT;
uniform float uPixelRatio;
uniform float uSize;
uniform vec3 uHot;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform sampler2D uContrib;

attribute float aRand;
attribute float aWeek;
attribute float aDay;

varying vec3 vColor;
varying float vAlpha;

void main() {
  // Contribution intensity for the (week, weekday) this particle represents.
  float c = texture2D(uContrib, vec2((aWeek + 0.5) / 53.0, (aDay + 0.5) / 7.0)).r;
  vec3 dir = normalize(position);

  // Sphere form: slow noise breathing plus contribution-weighted spikes that
  // pulse on their own phase, so busy weeks visibly "speak".
  float n = snoise(dir * 2.2 + vec3(0.0, uTime * 0.12, uTime * 0.07));
  float spike = c * (0.5 + 0.5 * sin(uTime * 1.8 + aWeek * 0.45 + aRand * 6.2831));
  float radial = 1.0 + uAmp * (0.10 * n + 0.42 * spike);
  vec3 spherePos = position * radial;

  // Flat form: a waveform bed laid out week by week beneath the ring.
  float wx = (aWeek / 52.0 - 0.5) * 6.0;
  float wz = (aDay / 6.0 - 0.5) * 1.4;
  float wave = c * (0.6 + 0.6 * sin(uTime * 1.6 + aWeek * 0.25 + aRand * 2.0)) * uAmp;
  vec3 planePos = vec3(wx, -1.35 + wave * 1.1 + 0.03 * n, wz);

  float m = smoothstep(0.0, 1.0, uMorph);
  vec3 p = mix(spherePos, planePos, m);

  // Ripple that radiates from a hovered repository node.
  float d = distance(p, uHot);
  float ripple = exp(-d * 2.5) * sin(uHotT * 7.0 - d * 9.0) * uHotT;
  p += dir * 0.18 * ripple;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float sizeBoost = 0.55 + 1.6 * c + 0.3 * aRand;
  gl_PointSize = uSize * uPixelRatio * sizeBoost * (6.0 / -mv.z);

  vColor = mix(uColorA, uColorB, clamp(c * 1.4 + 0.15 * n, 0.0, 1.0));
  vAlpha = (0.28 + 0.72 * c) * (0.7 + 0.3 * aRand);
}
