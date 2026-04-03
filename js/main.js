AFRAME.registerComponent('pool-water', {
  init: function () {
    const el = this.el;
    const THREE = AFRAME.THREE;

    // Create a canvas texture to simulate moving water
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1.5);

    this.canvas = canvas;
    this.ctx = ctx;
    this.texture = texture;
    this.time = 0;

    el.addEventListener('model-loaded', () => {
      const mesh = el.getObject3D('mesh');
      if (mesh) {
        mesh.traverse((node) => {
          if (node.isMesh) {
            node.material.map = texture;
            node.material.transparent = true;
            node.material.opacity = 0.9;
            node.material.needsUpdate = true;
          }
        });
      }
    });

    // If plane is simple, set material now
    el.addEventListener('loaded', () => {
      const mesh = el.getObject3D('mesh');
      if (mesh) {
        mesh.traverse((node) => {
          if (node.isMesh && node.material) {
            node.material.map = texture;
            node.material.transparent = true;
            node.material.opacity = 0.85;
            node.material.needsUpdate = true;
          }
        });
      }
    });
  },
  tick: function (t, dt) {
    const ctx = this.ctx;
    const canvas = this.canvas;
    this.time += dt / 1000;
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Draw base gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#a5e1ff');
    grad.addColorStop(1, '#3aa0d6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Draw moving sine waves
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    const waves = 3;
    for (let i = 0; i < waves; i++) {
      ctx.beginPath();
      const amplitude = 6 + i * 4;
      const freq = 0.002 + i * 0.0015;
      const speed = 0.6 + i * 0.4;
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 10) {
        const y = h / 2 + Math.sin((x * freq) + this.time * speed + i) * amplitude;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Add subtle normal-like highlights
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 73 + (this.time * 40) % w) % w;
      ctx.beginPath();
      ctx.ellipse(x, h / 2 + Math.sin(this.time + i) * 8, 40, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Slightly scroll the texture to simulate small ripples
    this.texture.offset.x = (this.time * 0.02) % 1;
    this.texture.offset.y = (this.time * 0.01) % 1;
    this.texture.needsUpdate = true;
  }
});

AFRAME.registerComponent('pet-bob', {
  schema: {},
  init: function () {
    this.startY = this.el.object3D.position.y;
    this.time = 0;
  },
  tick: function (t, dt) {
    this.time += dt / 1000;
    const y = this.startY + Math.sin(this.time * 2) * 0.08;
    const rot = Math.sin(this.time * 3) * 4;
    this.el.object3D.position.y = y;
    this.el.object3D.rotation.y = rot * Math.PI / 180;
  }
});

AFRAME.registerComponent('floaty', {
  schema: { amplitude: { type: 'number', default: 0.1 }, speed: { type: 'number', default: 1.0 } },
  init: function () {
    this.origin = this.el.object3D.position.clone();
    this.t = 0;
  },
  tick: function (t, dt) {
    this.t += dt / 1000;
    this.el.object3D.position.y = this.origin.y + Math.sin(this.t * this.data.speed) * this.data.amplitude;
  }
});

AFRAME.registerComponent('optimize-gltf', {
  schema: {},
  init: function () {
    this.el.addEventListener('model-loaded', (e) => {
      const obj = this.el.getObject3D('mesh');
      if (!obj) return;
      obj.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = node.receiveShadow = false;
          if (node.material) {
            node.material.metalness = node.material.metalness || 0.0;
            node.material.roughness = node.material.roughness || 1.0;
            node.material.needsUpdate = true;
          }
        }
      });
    });
  }
});

// Water volume component: defines a simple rectangular water region for buoyancy checks
AFRAME.registerComponent('water-volume', {
  schema: {
    width: { type: 'number', default: 4 },
    depth: { type: 'number', default: 2 },
    surfaceY: { type: 'number', default: 0.12 },
    density: { type: 'number', default: 1.0 }
  },
  init: function () {
    // nothing heavy to init; other components will query this
  }
});

// Buoyant component: apply upward force to dynamic bodies when submerged in water-volume (#water)
AFRAME.registerComponent('buoyant', {
  schema: { floatStrength: { type: 'number', default: 8 } },
  init: function () {
    this.water = document.querySelector('#water');
    this.body = null;
  },
  tick: function (t, dt) {
    if (!this.water) return;
    if (!this.body) this.body = this.el.body;
    if (!this.body) return; // physics body not ready yet

    const objPos = new AFRAME.THREE.Vector3();
    this.el.object3D.getWorldPosition(objPos);

    const waterPos = new AFRAME.THREE.Vector3();
    this.water.object3D.getWorldPosition(waterPos);

    const wComp = this.water.components['water-volume'];
    if (!wComp) return;

    // Use the water's world Y as the surface level (water plane's world position already includes local offset)
    const surfaceY = waterPos.y;

    // Attempt to get mesh height for more accurate submerged fraction
    const mesh = this.el.getObject3D('mesh');
    let height = 0.5; // fallback
    if (mesh) {
      const box = new AFRAME.THREE.Box3().setFromObject(mesh);
      height = Math.max(0.001, box.max.y - box.min.y);
    }

    const bottomY = objPos.y - (height / 2);
    const submergedDepth = surfaceY - bottomY;
    if (submergedDepth <= 0) return;

    const submergedFraction = Math.min(submergedDepth / Math.min(height, wComp.data.depth), 1);

    // Buoyant force approximated as (displaced mass * g) scaled by floatStrength
    const mass = this.body.mass || 1;
    const g = 9.82;
    const displacedMass = mass * submergedFraction * wComp.data.density;
    const forceMag = displacedMass * g * (this.data.floatStrength / 10);

    if (typeof CANNON !== 'undefined' && this.body) {
      const force = new CANNON.Vec3(0, forceMag, 0);
      this.body.applyForce(force, this.body.position);
      // gentle damping to prevent sinking through
      this.body.velocity.y *= 0.98;
    }
  }
});
