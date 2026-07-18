attribute vec3 aPos;
attribute vec4 aRot;
attribute float aTintOffset;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vScreenUv;
varying float vTintOffset;

/* -------------------------------------------------------------------------- */
/*                                  rotation                                  */
/* -------------------------------------------------------------------------- */
vec3 rotateByQuat(vec3 v, vec4 q) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

vec4 qmul(vec4 a, vec4 b) {
  return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz));
}

/* -------------------------------------------------------------------------- */
/*                                    main                                    */
/* -------------------------------------------------------------------------- */
void main() {
  // get rotation
  float a = 3.14 * 0.25;
  vec4 spin = vec4(0.0, sin(a), 0.0, cos(a));
  vec4 rot = qmul(spin, aRot);

  // update position
  vec3 transformedPos = aPos + rotateByQuat(position, rot);
  vec4 worldPos = modelMatrix * vec4(transformedPos, 1.0);

  // get normal
  vec3 rotatedNormal = rotateByQuat(normal, rot);

  // main
  gl_Position = projectionMatrix * viewMatrix * worldPos;

  // set normals
  vWorldPos = worldPos.xyz;
  vNormal = normalize(mat3(modelMatrix) * rotatedNormal);
  vScreenUv = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
  vTintOffset = aTintOffset;
}
