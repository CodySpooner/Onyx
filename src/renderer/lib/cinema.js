import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { effective } from './graph-settings.mjs'

// ── the AAA kit ─────────────────────────────────────────────────
// Kit A: a PMREM environment so gem facets catch colored studio reflections.
// Kit B: one shared composer — ACES tonemap + bloom + a single combined
// grade pass (grain/vignette/chromatic fringe) + OutputPass.
// PMREM textures are GL-context-bound and each lens owns its renderer, so
// makeEnv() runs per view MOUNT (~20ms once) and views dispose their copy.

// "NebulaStudio": not a beige photo studio — a space-toned light rig.
// Emissive quads act as area lights; the PMREM blur turns them into soft
// colored reflections streaking across clearcoat gem facets.
function nebulaStudioScene() {
  const scene = new THREE.Scene()

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 16, 16),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })
  )
  const pos = sky.geometry.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const bottom = new THREE.Color('#050818')
  const top = new THREE.Color('#2a1a5e')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) / 10 + 1) / 2
    c.lerpColors(bottom, top, t)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  sky.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  scene.add(sky)

  const quad = (w, h, hex, intensity, x, y, z, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity), side: THREE.DoubleSide })
    )
    m.position.set(x, y, z)
    m.rotation.set(rx, ry, 0)
    scene.add(m)
  }
  quad(6, 1, '#ffffff', 8, 0, 6, 0, 0, Math.PI / 2) // key strip overhead
  quad(3, 3, '#59f0ff', 4, -6, 1, 0, Math.PI / 2) // cyan left
  quad(3, 3, '#ff4fd8', 4, 6, 1, 0, -Math.PI / 2) // magenta right
  quad(1, 1, '#ffb35e', 3, 0, -3, -6) // amber low-back
  return scene
}

export function makeEnv(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const tex = pmrem.fromScene(nebulaStudioScene(), 0.04).texture
  pmrem.dispose()
  return tex
}

// grain + vignette + edge chromatic fringe in ONE fullscreen pass
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.012 },
    vig: { value: 0.28 },
    chroma: { value: 0.0009 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, grain, vig, chroma;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + d * chroma * r2 * 12.0).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - d * chroma * r2 * 12.0).b;
      float g = fract(sin(dot(vUv * vec2(time * 13.7 + 1.0, time * 17.3 + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * grain;
      col *= 1.0 - vig * smoothstep(0.35, 0.85, r2);
      gl_FragColor = vec4(col, 1.0);
    }`
}

export function makeComposer(renderer, scene, camera, { w, h, bloom = [0.65, 0.5, 0.3] } = {}) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.85 // keep the deep-space mood — dark frame, hot cores
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), bloom[0], bloom[1], bloom[2]))
  const grade = new ShaderPass(GradeShader)
  composer.addPass(grade)
  composer.addPass(new OutputPass()) // required in r169: applies tonemap+sRGB in composer chains
  const dispose = () => {
    for (const pass of composer.passes) pass.dispose?.()
    composer.dispose() // frees renderTarget1/2 — renderer.dispose() does NOT
  }
  return { composer, grade, dispose }
}

// one shared live-apply: every '*'-routed setting lands here for any view
// exposing renderer/composer/grade/lines/scene. Views cache this.eff for
// their loops (speed/spin); build-time keys route through rebuilds instead.
// user sliders scale each view's own tuned baseline (captured on first
// apply) rather than overwrite it — at defaults every lens keeps its look
const LINK_LAYERS = ['lines', 'flatLines', 'arcLines', 'links', 'fan', 'edges', 'arcs']
export function applyCommonSettings(view, s) {
  const e = effective(s)
  view.eff = e
  if (view.renderer) view.renderer.toneMappingExposure = e['look.exposure']
  const bloom = view.composer?.passes?.find((p) => p.strength !== undefined && p.threshold !== undefined)
  if (bloom) {
    if (bloom._base === undefined) bloom._base = { s: bloom.strength, t: bloom.threshold }
    bloom.strength = bloom._base.s * (e['look.bloom'] / 0.65)
    bloom.threshold = Math.max(0, Math.min(1, bloom._base.t + (e['look.bloomThreshold'] - 0.3)))
  }
  if (view.grade) {
    view.grade.uniforms.grain.value = e['look.grain']
    view.grade.uniforms.vig.value = e['look.vignette']
    view.grade.uniforms.chroma.value = e['look.chroma']
  }
  for (const k of LINK_LAYERS) {
    const m = view[k]?.material
    if (!m) continue
    if (m.userData.baseOp === undefined) m.userData.baseOp = m.opacity
    m.opacity = Math.min(1, m.userData.baseOp * (e['look.linkOpacity'] / 0.1))
  }
  const neb = view.scene?.children.find((ch) => ch.userData?.nebula)
  if (neb) neb.material.color.setScalar(e['theme.nebulaDim'])
}
