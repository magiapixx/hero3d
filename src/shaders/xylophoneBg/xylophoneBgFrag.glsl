uniform vec3 u_color;
uniform vec3 u_colorDark;
uniform float u_themeMix;
uniform float u_debugPattern;

varying vec2 v_uv;

void main() {
  float t = smoothstep(0.0, 1.0, v_uv.y * 0.5 + (1.0 - v_uv.x) * 0.5);

  vec3 light = mix(u_color, vec3(1.0), t - 0.3);
  vec3 dark = u_colorDark * mix(0.75, 1.25, t);

  vec3 color = mix(dark, light, u_themeMix);

  /* ----------------------------------- dev ---------------------------------- */
  // checkerboard pattern
  if (u_debugPattern > 0.5) {
    vec2 c = step(0.5, fract(v_uv * 10.0));
    color = vec3(abs(c.x - c.y));
  }

  /* ---------------------------------- main ---------------------------------- */
  gl_FragColor = vec4(color, 1.0);
}
