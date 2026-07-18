varying vec2 vUv;
uniform sampler2D u_tTexture;
void main() {
  vec3 tex = texture2D(u_tTexture, vUv).rgb;
  float alpha = max(tex.r, max(tex.g, tex.b));

  gl_FragColor = vec4(tex, alpha);
}