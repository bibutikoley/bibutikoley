attribute float aAngle;
attribute float aLevel;

uniform float uHead;

varying float vGlow;
varying float vLevel;
varying float vY;

void main() {
  // Angular distance to the playhead, wrapped to [-pi, pi].
  float d = abs(mod(aAngle - uHead + 3.14159265, 6.28318531) - 3.14159265);
  vGlow = exp(-d * d * 60.0);
  vLevel = aLevel;
  vY = position.y;

  vec4 local = vec4(position, 1.0);
  // Bars under the playhead stretch upward a little, like a level meter.
  local.y *= 1.0 + vGlow * 0.35;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * local;
}
