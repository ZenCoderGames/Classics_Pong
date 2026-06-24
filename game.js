import { CONFIG } from "./config.js";

const canvas = document.getElementById("game-canvas");
const displayCtx = canvas.getContext("2d");

const sceneCanvas = document.createElement("canvas");
sceneCanvas.width = CONFIG.canvas.width;
sceneCanvas.height = CONFIG.canvas.height;
const ctx = sceneCanvas.getContext("2d");

const livesP1El = document.getElementById("lives-p1");
const livesP2El = document.getElementById("lives-p2");
const menuOverlay = document.getElementById("menu-overlay");
const victoryOverlay = document.getElementById("victory-overlay");
const victoryTitle = document.getElementById("victory-title");
const victoryMessage = document.getElementById("victory-message");
const playBtn = document.getElementById("play-btn");
const restartBtn = document.getElementById("restart-btn");
const musicToggle = document.getElementById("music-toggle");

canvas.width = CONFIG.canvas.width;
canvas.height = CONFIG.canvas.height;

const GameState = {
  MENU: "menu",
  COUNTDOWN: "countdown",
  PLAYING: "playing",
  LIFE_LOST: "life_lost",
  VICTORY: "victory",
};

const keys = new Set();
let audioCtx = null;
let audioEnabled = CONFIG.audio.enabledByDefault;

const music = new Audio();
music.loop = true;
music.preload = "auto";

let musicGain = null;
let musicConnected = false;

const assets = {
  ball: null,
};

let backgroundPattern = null;

const state = {
  phase: GameState.MENU,
  lives: [CONFIG.lives.starting, CONFIG.lives.starting],
  countdownValue: 0,
  countdownTimer: 0,
  hitPauseTimer: 0,
  shakeTimer: 0,
  shakeDurationMs: 0,
  shakeAmplitude: 0,
  shakeDirectionX: 0,
  paddleFlash: [0, 0],
  edgeFlashTimer: 0,
  edgeFlashSide: null,
  lifeLostFreezeTimer: 0,
  pendingVictory: null,
  particles: [],
  trail: [],
  paddleTrails: [[], []],
};

const paddles = [
  { x: 0, y: 0, w: CONFIG.paddle.width, h: CONFIG.paddle.height },
  { x: 0, y: 0, w: CONFIG.paddle.width, h: CONFIG.paddle.height },
];

const ball = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: CONFIG.ball.radius,
};

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function getMusicGainValue() {
  const { masterVolume, musicVolume, musicAttenuation } = CONFIG.audio;
  return musicVolume * masterVolume * musicAttenuation;
}

function connectMusicToAudioGraph() {
  const ac = getAudioContext();
  if (!ac || musicConnected) return;

  const source = ac.createMediaElementSource(music);
  musicGain = ac.createGain();
  source.connect(musicGain);
  musicGain.connect(ac.destination);
  musicConnected = true;
  music.volume = 1;
}

async function loadAssets() {
  assets.ball = await loadImage(CONFIG.assets.ball);
  backgroundPattern = buildCheckeredBackground();
  music.src = CONFIG.assets.music;
}

function syncMusic(shouldPlay = state.phase !== GameState.MENU && state.phase !== GameState.VICTORY) {
  connectMusicToAudioGraph();

  const gain = getMusicGainValue();
  if (musicGain) {
    musicGain.gain.value = audioEnabled && shouldPlay ? gain : 0;
  } else {
    music.volume = gain;
  }

  if (!audioEnabled || !shouldPlay) {
    music.pause();
    return;
  }

  music.play().catch(() => {});
}

function buildCheckeredBackground() {
  const { width, height } = CONFIG.canvas;
  const { checkerSize, checkerLight, checkerDark, blurPx } = CONFIG.background;

  const sharp = document.createElement("canvas");
  sharp.width = width;
  sharp.height = height;
  const sharpCtx = sharp.getContext("2d");

  sharpCtx.fillStyle = CONFIG.colors.background;
  sharpCtx.fillRect(0, 0, width, height);

  for (let row = 0, y = 0; y < height; row += 1, y += checkerSize) {
    for (let col = 0, x = 0; x < width; col += 1, x += checkerSize) {
      sharpCtx.fillStyle = (row + col) % 2 === 0 ? checkerLight : checkerDark;
      sharpCtx.fillRect(x, y, checkerSize, checkerSize);
    }
  }

  const blurred = document.createElement("canvas");
  blurred.width = width;
  blurred.height = height;
  const blurredCtx = blurred.getContext("2d");
  blurredCtx.filter = `blur(${blurPx}px)`;
  blurredCtx.drawImage(sharp, 0, 0);

  return blurred;
}

function getAudioContext() {
  if (!audioEnabled) return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone({ frequency, duration = 0.1, volume = 0.12, type = "sine", ramp = 1.15 }) {
  const ac = getAudioContext();
  if (!ac) return;

  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const vol = volume * CONFIG.audio.masterVolume;

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  osc.frequency.exponentialRampToValueAtTime(frequency * ramp, now + duration * 0.45);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(vol, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playPaddleHitSound() {
  playTone({ frequency: 520, duration: 0.09, volume: 0.14, type: "square", ramp: 1.22 });
}

function playWallHitSound() {
  playTone({ frequency: 280, duration: 0.07, volume: 0.1, type: "triangle", ramp: 1.08 });
}

function playBreakSound() {
  const ac = getAudioContext();
  if (!ac) return;

  const now = ac.currentTime;
  const vol = CONFIG.audio.masterVolume;

  playTone({ frequency: 95, duration: 0.28, volume: 0.22, type: "sawtooth", ramp: 0.45 });

  const bufferSize = Math.floor(ac.sampleRate * 0.18);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.2 * vol, now + 0.012);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  noise.connect(noiseGain);
  noiseGain.connect(ac.destination);
  noise.start(now);

  playTone({ frequency: 1400, duration: 0.06, volume: 0.1, type: "square", ramp: 0.35 });
}

function playCountdownTick() {
  playTone({ frequency: 440, duration: 0.08, volume: 0.1, type: "sine", ramp: 1.05 });
}

function playCountdownGo() {
  playTone({ frequency: 660, duration: 0.12, volume: 0.12, type: "sine", ramp: 1.1 });
}

function resetPaddles() {
  const { width, height } = CONFIG.canvas;
  const { offsetFromEdge } = CONFIG.paddle;

  paddles[0].x = offsetFromEdge;
  paddles[1].x = width - offsetFromEdge - CONFIG.paddle.width;
  paddles[0].y = paddles[1].y = (height - CONFIG.paddle.height) / 2;
  paddles[0].prevY = paddles[0].y;
  paddles[1].prevY = paddles[1].y;
}

function randomBallVelocity() {
  const { baseSpeed, minAngleDeg, maxAngleDeg } = CONFIG.ball;
  const angleDeg = minAngleDeg + Math.random() * (maxAngleDeg - minAngleDeg);
  const angleRad = (angleDeg * Math.PI) / 180;
  const direction = Math.random() < 0.5 ? -1 : 1;
  const speed = baseSpeed;

  return {
    vx: Math.cos(angleRad) * speed * direction,
    vy: (Math.random() < 0.5 ? -1 : 1) * Math.sin(angleRad) * speed,
  };
}

function playVictorySound() {
  playTone({ frequency: 440, duration: 0.12, volume: 0.14 });
  setTimeout(() => playTone({ frequency: 554, duration: 0.12, volume: 0.14 }), 120);
  setTimeout(() => playTone({ frequency: 659, duration: 0.18, volume: 0.16 }), 240);
}

function placeBallAtCenter() {
  const { width, height } = CONFIG.canvas;
  ball.x = width / 2;
  ball.y = height / 2;
  ball.vx = 0;
  ball.vy = 0;
  state.trail = [{ x: ball.x, y: ball.y, alpha: 1 }];
}

function launchBall() {
  const vel = randomBallVelocity();
  ball.vx = vel.vx;
  ball.vy = vel.vy;
}

function startRoundCountdown() {
  placeBallAtCenter();
  state.phase = GameState.COUNTDOWN;
  state.countdownValue = CONFIG.countdown.startValue;
  state.countdownTimer = CONFIG.countdown.stepMs;
  playCountdownTick();
}

function resetMatch() {
  state.lives = [CONFIG.lives.starting, CONFIG.lives.starting];
  state.particles = [];
  state.trail = [];
  state.hitPauseTimer = 0;
  state.shakeTimer = 0;
  state.shakeDurationMs = 0;
  state.shakeAmplitude = 0;
  state.shakeDirectionX = 0;
  state.edgeFlashTimer = 0;
  state.edgeFlashSide = null;
  state.lifeLostFreezeTimer = 0;
  state.pendingVictory = null;
  state.paddleFlash = [0, 0];
  state.countdownValue = 0;
  state.countdownTimer = 0;
  state.paddleTrails = [[], []];
  resetPaddles();
  placeBallAtCenter();
  updateHud();
}

function updateHud() {
  livesP1El.textContent = String(state.lives[0]);
  livesP2El.textContent = String(state.lives[1]);
}

function showOverlay(overlay) {
  overlay.classList.remove("hidden");
}

function hideOverlay(overlay) {
  overlay.classList.add("hidden");
}

function startGame() {
  hideOverlay(menuOverlay);
  hideOverlay(victoryOverlay);
  resetMatch();
  startRoundCountdown();
}

function endVictory(winnerIndex) {
  state.phase = GameState.VICTORY;
  syncMusic(false);
  victoryTitle.textContent = "Victory";
  victoryMessage.textContent = `Player ${winnerIndex + 1} wins!`;
  showOverlay(victoryOverlay);
  playVictorySound();
}

function spawnParticles(x, y, color) {
  const { particleCount, particleLifeMs } = CONFIG.effects;
  for (let i = 0; i < particleCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 160;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: particleLifeMs,
      maxLife: particleLifeMs,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

function spawnBreakParticles(x, y, sideIndex) {
  const { lifeLostParticleCount, particleLifeMs } = CONFIG.effects;
  const color = sideIndex === 0 ? CONFIG.colors.player1 : CONFIG.colors.player2;
  const burstDirection = sideIndex === 0 ? -1 : 1;

  for (let i = 0; i < lifeLostParticleCount; i += 1) {
    const angle = (Math.random() - 0.5) * Math.PI * 0.8 + (burstDirection < 0 ? Math.PI : 0);
    const speed = 120 + Math.random() * 220;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: particleLifeMs,
      maxLife: particleLifeMs,
      color,
      size: 3 + Math.random() * 5,
    });
  }
}

function triggerPaddleHit(playerIndex) {
  state.hitPauseTimer = CONFIG.effects.hitPauseMs;
  state.shakeTimer = CONFIG.effects.shakeDurationMs;
  state.shakeDurationMs = CONFIG.effects.shakeDurationMs;
  state.shakeAmplitude = CONFIG.effects.shakeAmplitude;
  state.shakeDirectionX = 0;
  state.paddleFlash[playerIndex] = CONFIG.effects.paddleFlashMs;
  spawnParticles(ball.x, ball.y, playerIndex === 0 ? CONFIG.colors.paddle1 : CONFIG.colors.paddle2);
  playPaddleHitSound();
}

function triggerBoundaryBounce() {
  playWallHitSound();
}

function triggerEdgeFlash(sideIndex) {
  state.edgeFlashSide = sideIndex;
  state.edgeFlashTimer = CONFIG.effects.edgeFlashMs;
}

function triggerLifeLostImpact(sideIndex) {
  triggerEdgeFlash(sideIndex);
  state.shakeDirectionX = sideIndex === 0 ? -1 : 1;
  state.shakeTimer = CONFIG.effects.lifeLostShakeDurationMs;
  state.shakeDurationMs = CONFIG.effects.lifeLostShakeDurationMs;
  state.shakeAmplitude = CONFIG.effects.lifeLostShakeAmplitude;
  spawnBreakParticles(ball.x, ball.y, sideIndex);
  playBreakSound();
}

function getShakeOffset() {
  if (state.shakeTimer <= 0) return { x: 0, y: 0 };

  const duration = state.shakeDurationMs || CONFIG.effects.shakeDurationMs;
  const progress = 1 - state.shakeTimer / duration;
  const amplitude = (state.shakeAmplitude || CONFIG.effects.shakeAmplitude) * (1 - progress);
  const t = performance.now();

  if (state.shakeDirectionX !== 0) {
    return {
      x: Math.sin(t * 0.095) * amplitude * state.shakeDirectionX,
      y: Math.cos(t * 0.13) * amplitude * 0.2,
    };
  }

  return {
    x: Math.sin(t * 0.085) * amplitude,
    y: Math.cos(t * 0.11) * amplitude * 0.55,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function reflectBallOffPaddle(paddle, playerIndex) {
  const relativeIntersect = (ball.y - (paddle.y + paddle.h / 2)) / (paddle.h / 2);
  const clampedIntersect = clamp(relativeIntersect, -0.92, 0.92);
  const bounceAngle = clampedIntersect * (Math.PI / 3.2);
  const direction = playerIndex === 0 ? 1 : -1;
  const speed = Math.min(
    CONFIG.ball.maxSpeed,
    Math.hypot(ball.vx, ball.vy) + CONFIG.ball.speedIncreaseOnHit,
  );

  ball.vx = Math.cos(bounceAngle) * speed * direction;
  ball.vy = Math.sin(bounceAngle) * speed;

  if (playerIndex === 0) {
    ball.x = paddle.x + paddle.w + ball.radius + 1;
  } else {
    ball.x = paddle.x - ball.radius - 1;
  }

  triggerPaddleHit(playerIndex);
}

function handlePaddleCollisions() {
  for (let i = 0; i < paddles.length; i += 1) {
    const paddle = paddles[i];
    const withinY = ball.y + ball.radius >= paddle.y && ball.y - ball.radius <= paddle.y + paddle.h;

    if (!withinY) continue;

    if (i === 0 && ball.vx < 0 && ball.x - ball.radius <= paddle.x + paddle.w && ball.x > paddle.x) {
      reflectBallOffPaddle(paddle, i);
    }

    if (i === 1 && ball.vx > 0 && ball.x + ball.radius >= paddle.x && ball.x < paddle.x + paddle.w) {
      reflectBallOffPaddle(paddle, i);
    }
  }
}

function loseLife(sideIndex) {
  ball.vx = 0;
  ball.vy = 0;

  triggerLifeLostImpact(sideIndex);
  state.lives[sideIndex] -= 1;
  updateHud();

  state.phase = GameState.LIFE_LOST;
  state.lifeLostFreezeTimer = CONFIG.effects.lifeLostFreezeMs;
  state.pendingVictory = state.lives[sideIndex] <= 0 ? 1 - sideIndex : null;
}

function updateLifeLost(dt) {
  state.lifeLostFreezeTimer -= dt * 1000;
  if (state.lifeLostFreezeTimer > 0) return;

  if (state.pendingVictory !== null) {
    const winner = state.pendingVictory;
    state.pendingVictory = null;
    endVictory(winner);
    return;
  }

  resetPaddles();
  startRoundCountdown();
}

function updatePaddleInput(dt) {
  const { height } = CONFIG.canvas;
  const paddleSpeed = CONFIG.paddle.speed;

  if (keys.has("KeyW")) paddles[0].y -= paddleSpeed * dt;
  if (keys.has("KeyS")) paddles[0].y += paddleSpeed * dt;
  if (keys.has("ArrowUp")) paddles[1].y -= paddleSpeed * dt;
  if (keys.has("ArrowDown")) paddles[1].y += paddleSpeed * dt;

  for (const paddle of paddles) {
    paddle.y = clamp(paddle.y, 0, height - paddle.h);
  }

  updatePaddleTrails();
}

function updatePaddleTrails() {
  const { trailLength } = CONFIG.paddle;

  paddles.forEach((paddle, index) => {
    const prevY = paddle.prevY ?? paddle.y;
    const dy = paddle.y - prevY;
    paddle.prevY = paddle.y;

    if (Math.abs(dy) < 0.35) {
      if (state.paddleTrails[index].length > 0) {
        state.paddleTrails[index].pop();
      }
      return;
    }

    const trail = state.paddleTrails[index];
    const steps = Math.min(trailLength, Math.max(2, Math.ceil(Math.abs(dy) / 4)));

    for (let step = steps; step >= 1; step -= 1) {
      const t = step / steps;
      trail.unshift({ y: paddle.y - dy * t });
    }

    while (trail.length > trailLength) {
      trail.pop();
    }
  });
}

function traceRoundedRect(x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPaddleShape(x, y, w, h, fillColor, outlineColor, outlineWidth, radius, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  traceRoundedRect(x, y, w, h, radius);
  ctx.fillStyle = fillColor;
  ctx.fill();

  if (outlineColor && outlineWidth > 0) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth;
    ctx.stroke();
  }

  ctx.restore();
}

function drawPaddleMotionTrail(paddle, index, fillColor) {
  const { trailLength, trailFade, trailBlurPx, cornerRadius } = CONFIG.paddle;
  const trail = state.paddleTrails[index];

  if (trail.length === 0) return;

  ctx.save();
  ctx.filter = `blur(${trailBlurPx}px)`;

  trail.forEach((entry, stepIndex) => {
    const t = 1 - stepIndex / trailLength;
    const alpha = t * trailFade;
    drawPaddleShape(
      paddle.x,
      entry.y,
      paddle.w,
      paddle.h,
      fillColor,
      null,
      0,
      cornerRadius,
      alpha,
    );
  });

  ctx.filter = "none";
  ctx.restore();
}

function updateCountdown(dt) {
  updatePaddleInput(dt);

  state.countdownTimer -= dt * 1000;
  if (state.countdownTimer > 0) return;

  state.countdownValue -= 1;
  if (state.countdownValue > 0) {
    state.countdownTimer = CONFIG.countdown.stepMs;
    playCountdownTick();
    return;
  }

  launchBall();
  state.phase = GameState.PLAYING;
  playCountdownGo();
}
function updatePlaying(dt) {
  const { width, height } = CONFIG.canvas;

  updatePaddleInput(dt);

  if (state.hitPauseTimer > 0) {
    state.hitPauseTimer -= dt * 1000;
    return;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.y - ball.radius <= 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy);
    triggerBoundaryBounce();
  } else if (ball.y + ball.radius >= height) {
    ball.y = height - ball.radius;
    ball.vy = -Math.abs(ball.vy);
    triggerBoundaryBounce();
  }

  handlePaddleCollisions();

  if (ball.x - ball.radius <= 0) {
    loseLife(0);
    return;
  }

  if (ball.x + ball.radius >= width) {
    loseLife(1);
    return;
  }

  state.trail.unshift({ x: ball.x, y: ball.y, alpha: 1 });
  if (state.trail.length > CONFIG.ball.trailLength) {
    state.trail.pop();
  }
}

function updateParticles(dt) {
  const dtMs = dt * 1000;
  state.particles = state.particles.filter((particle) => {
    particle.life -= dtMs;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 120 * dt;
    return particle.life > 0;
  });
}

function updateTimers(dt) {
  const dtMs = dt * 1000;

  if (state.shakeTimer > 0) state.shakeTimer -= dtMs;
  if (state.edgeFlashTimer > 0) state.edgeFlashTimer -= dtMs;
  if (state.paddleFlash[0] > 0) state.paddleFlash[0] -= dtMs;
  if (state.paddleFlash[1] > 0) state.paddleFlash[1] -= dtMs;
}

function drawBackground() {
  const { width, height } = CONFIG.canvas;
  const { colors } = CONFIG;
  const { homeBaseWidth } = CONFIG.background;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);

  if (backgroundPattern) {
    ctx.drawImage(backgroundPattern, 0, 0, width, height);
  }

  ctx.fillStyle = colors.player1;
  ctx.fillRect(0, 0, homeBaseWidth, height);
  ctx.fillStyle = colors.player2;
  ctx.fillRect(width - homeBaseWidth, 0, homeBaseWidth, height);

  ctx.setLineDash([10, 14]);
  ctx.strokeStyle = colors.centerLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2, 12);
  ctx.lineTo(width / 2, height - 12);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawEdgeFlash() {
  if (state.edgeFlashTimer <= 0 || state.edgeFlashSide === null) return;

  const { width, height } = CONFIG.canvas;
  const { homeBaseWidth } = CONFIG.background;
  const progress = state.edgeFlashTimer / CONFIG.effects.edgeFlashMs;
  const alpha = progress * 0.9;
  const edgeX = state.edgeFlashSide === 0 ? 0 : width - homeBaseWidth;
  const edgeColor = state.edgeFlashSide === 0 ? CONFIG.colors.player1 : CONFIG.colors.player2;

  ctx.fillStyle = edgeColor;
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillRect(edgeX, 0, homeBaseWidth, height);

  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = alpha * 0.45;
  ctx.fillRect(edgeX, 0, homeBaseWidth, height);
  ctx.globalAlpha = 1;
}

function drawPaddles() {
  const paddleColors = [CONFIG.colors.paddle1, CONFIG.colors.paddle2];
  const paddleOutlines = [CONFIG.colors.paddle1Outline, CONFIG.colors.paddle2Outline];
  const { cornerRadius, outlineWidth } = CONFIG.paddle;

  paddles.forEach((paddle, index) => {
    drawPaddleMotionTrail(paddle, index, paddleColors[index]);
  });

  paddles.forEach((paddle, index) => {
    drawPaddleShape(
      paddle.x,
      paddle.y,
      paddle.w,
      paddle.h,
      paddleColors[index],
      paddleOutlines[index],
      outlineWidth,
      cornerRadius,
    );

    if (state.paddleFlash[index] > 0) {
      const flashAlpha = state.paddleFlash[index] / CONFIG.effects.paddleFlashMs;
      drawPaddleShape(
        paddle.x,
        paddle.y,
        paddle.w,
        paddle.h,
        `rgba(255, 255, 255, ${0.55 * flashAlpha})`,
        null,
        0,
        cornerRadius,
      );
    }
  });
}

function drawTrail() {
  const { trailFade, trailColor, trailCoreColor } = CONFIG.ball;
  const tailRgb = hexToRgb(trailColor);
  const coreRgb = hexToRgb(trailCoreColor);

  state.trail.forEach((point, index) => {
    const t = 1 - index / CONFIG.ball.trailLength;
    const alpha = t * trailFade;
    const radius = ball.radius * (0.35 + t * 0.55);
    const r = Math.round(coreRgb.r * t + tailRgb.r * (1 - t));
    const g = Math.round(coreRgb.g * t + tailRgb.g * (1 - t));
    const b = Math.round(coreRgb.b * t + tailRgb.b * (1 - t));

    ctx.beginPath();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBall() {
  const size = ball.radius * 2;

  if (assets.ball) {
    ctx.drawImage(assets.ball, ball.x - ball.radius, ball.y - ball.radius, size, size);
  } else {
    ctx.beginPath();
    ctx.fillStyle = CONFIG.colors.ballFallback;
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCountdown() {
  if (state.phase !== GameState.COUNTDOWN || state.countdownValue <= 0) return;

  const { width, height } = CONFIG.canvas;
  const pulse = 0.85 + 0.15 * Math.sin(performance.now() * 0.012);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${Math.round(120 * pulse)}px "Trebuchet MS", "Segoe UI", sans-serif`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.shadowColor = "rgba(255, 255, 255, 0.45)";
  ctx.shadowBlur = 28;
  ctx.fillText(String(state.countdownValue), width / 2, height / 2);
  ctx.restore();
}

function drawParticles() {
  state.particles.forEach((particle) => {
    const alpha = particle.life / particle.maxLife;
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    ctx.globalAlpha = 1;
  });
}

function render() {
  const { width, height } = CONFIG.canvas;
  const { blurPx } = CONFIG.postProcess;

  ctx.clearRect(0, 0, width, height);

  const shake = getShakeOffset();

  ctx.save();
  ctx.translate(shake.x, shake.y);
  drawBackground();
  drawEdgeFlash();
  drawTrail();
  drawPaddles();
  drawBall();
  drawParticles();
  drawCountdown();
  ctx.restore();

  displayCtx.clearRect(0, 0, width, height);
  displayCtx.filter = `blur(${blurPx}px)`;
  displayCtx.drawImage(sceneCanvas, 0, 0, width, height);
  displayCtx.filter = "none";
}

let lastTime = 0;

function gameLoop(timestamp) {
  const dt = Math.min(0.033, (timestamp - lastTime) / 1000 || 0);
  lastTime = timestamp;

  if (state.phase === GameState.PLAYING) {
    updatePlaying(dt);
  } else if (state.phase === GameState.COUNTDOWN) {
    updateCountdown(dt);
  } else if (state.phase === GameState.LIFE_LOST) {
    updateLifeLost(dt);
  }

  updateTimers(dt);
  updateParticles(dt);
  render();

  requestAnimationFrame(gameLoop);
}

function setupInput() {
  window.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
      event.preventDefault();
    }
    keys.add(event.code);
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });
}

function setupUi() {
  playBtn.addEventListener("click", () => {
    getAudioContext();
    startGame();
    syncMusic(true);
  });

  restartBtn.addEventListener("click", () => {
    startGame();
    syncMusic(true);
  });

  musicToggle.addEventListener("click", () => {
    audioEnabled = !audioEnabled;
    musicToggle.textContent = audioEnabled ? "Sound: On" : "Sound: Off";
    if (audioEnabled) {
      getAudioContext();
    }
    syncMusic();
  });
}

async function init() {
  resetPaddles();
  placeBallAtCenter();
  updateHud();
  setupInput();
  setupUi();
  await loadAssets();
  requestAnimationFrame(gameLoop);
}

init();
