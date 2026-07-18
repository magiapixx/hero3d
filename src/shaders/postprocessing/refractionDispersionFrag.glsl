// pmndrs Effect fragment. At glass pixels, reveals the bent *background* through
// the (opaque) bars using the glass G-buffer (view normal + mask). The background
// comes from a dedicated bg-only buffer so it shows through the whole bar, not just
// the silhouette. Chromatic dispersion splits the RGB sample offsets.
uniform sampler2D u_tGlassBuffer; // rgb = encoded view normal, a = glass mask
uniform sampler2D u_tBackground;  // "behind glass" content (bg-only render)
uniform float u_strength;         // base screen-space refraction offset (uv units)
uniform float u_dispersion;       // RGB split amount
uniform float u_refractMix;       // how strongly glass shows the bent background (see-through amount)
uniform float u_glassMix;         // 0 = matte (no refraction), 1 = glass

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec4 g = texture2D(u_tGlassBuffer, uv);
  float mask = g.a;

  if (mask < 0.5) {
    outputColor = inputColor;
    return;
  }

  // decode view-space normal; xy bends in the screen plane
  vec3 viewN = normalize(g.rgb * 2.0 - 1.0);

  // bevel/edge weight: stronger refraction at grazing angles (silhouette),
  // calmer across the flat face — sells thickness on thin bars.
  float edge = pow(1.0 - clamp(abs(viewN.z), 0.0, 1.0), 1.5);
  vec2 off = viewN.xy * u_strength * (0.25 + 0.75 * edge) * u_glassMix;

  // chromatic dispersion: sample the background R/G/B at slightly different offsets
  vec3 refr;
  refr.r = texture2D(u_tBackground, uv + off * (1.0 + u_dispersion)).r;
  refr.g = texture2D(u_tBackground, uv + off).g;
  refr.b = texture2D(u_tBackground, uv + off * (1.0 - u_dispersion)).b;

  // glass = mostly the bent background with the bar's reflections/sheen kept on top.
  // gate the see-through by u_glassMix so matte stays fully opaque.
  outputColor = vec4(mix(inputColor.rgb, refr, u_refractMix * u_glassMix), inputColor.a);
}
