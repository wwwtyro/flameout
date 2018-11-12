"use strict";

const glsl = require('glslify')

// Grab the canvas and size it.
const canvas = document.getElementById('render-canvas');
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

// Create our regl object.
const regl = require('regl')({
  canvas: canvas,
  extensions: ['OES_texture_float'],
});

// Make a set of ping-pong buffers.
const pingPong = [
  regl.framebuffer({
    width: canvas.width,
    height: canvas.height,
    colorFormat: 'rgba',
    colorType: 'float',
  }),
  regl.framebuffer({
    width: canvas.width,
    height: canvas.height,
    colorFormat: 'rgba',
    colorType: 'float',
  }),
];

// Make the paper.
regl({
  vert: `
    precision highp float;
    attribute vec2 position;
    varying vec2 vPos;
    void main() {
      gl_Position = vec4(position, 0, 1);
      vPos = position;
    }`,

  frag: glsl`
    precision highp float;
    varying vec2 vPos;
    uniform vec2 offset;

    #pragma glslify: noise = require('glsl-noise/classic/3d')

    float octaveNoise(vec2 p) {
      float scale = 1.0;
      float mag = 1.0;
      float sum = 0.0;
      float total = 0.0;
      for (int i = 0; i < 9; i++) {
        sum += mag * noise(vec3(scale * p, 0));
        total += mag;
        mag *= 0.5;
        scale *= 2.0;
        p += 2.0;
      }
      return pow(1.0 - sum / total, 4.0);
    }

    void main() {
      float n = octaveNoise(vPos * 3.0 + offset * 1000.0);
      float t = 0.0;
      gl_FragColor = vec4(n, t, n, 0);
    }`,
  attributes: {
    position: [
      -1, -1,
       1, -1,
       1,  1,
      -1, -1,
       1,  1,
      -1,  1
    ],
  },
  uniforms: {
    offset: [2 * Math.random() - 1, 2 * Math.random() - 1],
  },
  viewport: {x: 0, y: 0, width: canvas.width, height: canvas.height},
  framebuffer: pingPong[0],
  count: 6,
})();



const cmdBurn = regl({
  vert: `
    precision highp float;
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0, 1);
    }`,

  frag: glsl`
    precision highp float;
    uniform sampler2D source;
    uniform vec2 resolution;
    uniform vec2 spark;

    vec2 dr = 1.0/resolution;
    const float burnTemp = 506.0;
    const float maxTemp = 1089.0;

    void main() {
      vec2 xy = gl_FragCoord.xy * dr;
      vec4 m0 = texture2D(source, xy + dr * vec2(0, 0));

      const int d = 3;

      float tn = 0.0;
      for (int x = -d; x <=d; x++) {
        for (int y = -d; y <= d; y++) {
          if (x == 0 && y == 0) continue;
          float txy = texture2D(source, xy + dr * vec2(x, y)).y;
          txy *= step(burnTemp, txy);
          tn += txy * exp(-1.0 * length(vec2(x, y)));
        }
      }

      // Current temperature
      float t = m0.y;

      // Add temperature from mouse
      if (spark.x >= 0.0) {
        float d = distance(gl_FragCoord.xy, spark*resolution);
        t += pow(m0.z, 0.25) * 64.0*exp(-0.04 * d);
      }

      // Add temperature from neighboring pixels
      t += 0.02 * m0.z * tn;

      // Current fuel
      float n = m0.x;

      // Combust if temperature is high enough.
      if (t > burnTemp) {
        t = min(t * 1.001, maxTemp) * n/m0.z;
        n *= 0.9899;
      }

      // Shut it down when out of fuel.
      if (n < 0.001) {
        t = 0.0;
        n = 0.0;
      }

      gl_FragColor = vec4(n, t, m0.z, 1);
    }`,
  attributes: {
    position: [
      -1, -1,
       1, -1,
       1,  1,
      -1, -1,
       1,  1,
      -1,  1
    ],
  },
  uniforms: {
    resolution: regl.prop('resolution'),
    source: regl.prop('source'),
    spark: regl.prop('spark'),
  },
  framebuffer: regl.prop('destination'),
  viewport: regl.prop('viewport'),
  count: 6,
});

// Render the current state.
const cmdFlame = regl({
  vert: `
    precision highp float;
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0, 1);
    }`,

  frag: glsl`
    precision highp float;
    uniform sampler2D source;
    uniform vec2 resolution;

    const float burnTemp = 506.0;
    float brownTemp = 0.6 * burnTemp;
    const float maxTemp = 1089.0;
    const float redTemp = 0.5 * (burnTemp + maxTemp);

    const vec3 white = vec3(1,1,1);
    const vec3 brown = 0.5 * vec3(0.8235294117647058, 0.4117647058823529, 0.11764705882352941);
    const vec3 black = vec3(0,0,0);
    const vec3 red = vec3(3,0.9,0);

    float stretch(float r, float a, float b) {
      return (r - a) / (b - a);
    }

    void main() {
      vec4 m0 = texture2D(source, gl_FragCoord.xy / resolution);
      float t = m0.y;
      float n = m0.x;
      vec4 c = vec4(0);
      if (n == m0.z) {
        if (t < brownTemp) {
          c = mix(vec4(white * 0.8, 1), vec4(brown, 1), stretch(t, 0.0, brownTemp));
        } else if (t < burnTemp) {
          c = mix(vec4(brown, 1), vec4(black, 1), stretch(t, brownTemp, burnTemp));
        }
      } else {
        if (t < burnTemp) {
          c = vec4(black, 1);
        } else if (t >= burnTemp && t < redTemp) {
          c = mix(vec4(black, 1), vec4(red, 1), stretch(t, burnTemp, redTemp));
        } else if (t >= redTemp) {
          c = mix(vec4(red,1), vec4(white,1), stretch(t, redTemp, maxTemp));
        }
      }
      gl_FragColor = c;
    }`,
  attributes: {
    position: [
      -1, -1,
       1, -1,
       1,  1,
      -1, -1,
       1,  1,
      -1,  1
    ],
  },
  uniforms: {
    resolution: regl.prop('resolution'),
    source: regl.prop('source'),
  },
  viewport: regl.prop('viewport'),
  count: 6,
});

const mouse = {
  down: false,
  x: 0,
  y: 0,
}

window.addEventListener('mousedown', function(e) {
  mouse.down = true;
  mouse.x = e.clientX / window.innerWidth;
  mouse.y = (window.innerHeight - e.clientY) / window.innerHeight;
});

window.addEventListener('mouseup', function(e) {
  mouse.down = false;
});

window.addEventListener('mousemove', function(e) {
  mouse.x = e.clientX / window.innerWidth;
  mouse.y = (window.innerHeight - e.clientY) / window.innerHeight;
})

let pingPongIndex = 0;

function loop() {

  for (let i = 0; i < 1; i++) {
    regl.clear({
      depth: 1,
      framebuffer: pingPong[1 - pingPongIndex],
    });

    cmdBurn({
      source: pingPong[pingPongIndex],
      destination: pingPong[1 - pingPongIndex],
      spark: mouse.down ? [mouse.x, mouse.y] : [-10000, -10000],
      resolution: [canvas.width, canvas.height],
      viewport: {x: 0, y: 0, width: canvas.width, height: canvas.height},
    });

    pingPongIndex = 1 - pingPongIndex;
  }

  cmdFlame({
    source: pingPong[pingPongIndex],
    resolution: [canvas.width, canvas.height],
    viewport: {x: 0, y: 0, width: canvas.width, height: canvas.height},
  });


  requestAnimationFrame(loop);
}

loop();
