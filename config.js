export const CONFIG = {
  canvas: {
    width: 800,
    height: 500,
  },

  paddle: {
    width: 14,
    height: 90,
    speed: 320,
    offsetFromEdge: 28,
    cornerRadius: 6,
    outlineWidth: 2.5,
    trailLength: 10,
    trailFade: 0.42,
    trailBlurPx: 0,
  },

  ball: {
    radius: 10,
    baseSpeed: 340,
    maxSpeed: 520,
    speedIncreaseOnHit: 25,
    minAngleDeg: 25,
    maxAngleDeg: 65,
    trailLength: 50,
    trailFade: 0.55,
    trailColor: "#fffbeb",
    trailCoreColor: "#fde68a",
  },

  lives: {
    starting: 3,
  },

  countdown: {
    startValue: 3,
    stepMs: 1000,
  },

  colors: {
    background: "#080910",
    centerLine: "rgba(255, 255, 255, 0.35)",
    player1: "rgba(39, 19, 97, 0.93)",
    player2: "rgba(103, 9, 9, 0.66)",
    paddle1: "rgba(19, 38, 132, 0.93)",
    paddle2: "rgba(163, 41, 41, 0.66)",
    paddle1Outline: "rgba(26, 107, 161, 0.93)",
    paddle2Outline: "rgba(198, 77, 41, 0.66)",
    ballFallback: "#f8f7ff",
    hitFlash: "rgba(255, 255, 255, 0.75)",
    wallFlash: "rgba(255, 255, 255, 0.18)",
  },

  background: {
    checkerSize: 40,
    checkerLight: "#141824",
    checkerDark: "#0c0e16",
    blurPx: 6,
    homeBaseWidth: 18,
  },

  assets: {
    ball: "art/Ball.png",
    music: "audio/music.mp3",
  },

  postProcess: {
    blurPx: 1,
  },

  effects: {
    hitPauseMs: 80,
    shakeDurationMs: 220,
    shakeAmplitude: 4,
    paddleFlashMs: 120,
    edgeFlashMs: 400,
    lifeLostFreezeMs: 1000,
    lifeLostShakeDurationMs: 450,
    lifeLostShakeAmplitude: 8,
    lifeLostParticleCount: 16,
    particleCount: 10,
    particleLifeMs: 380,
  },

  audio: {
    enabledByDefault: true,
    masterVolume: 0.35,
    musicVolume: 0.5,
    musicAttenuation: 0.08,
  },

  ai: {
    startSkill: 0.45,
    minSkill: 0.15,
    maxSkill: 0.95,
    baseSpeedRatio: 0.42,
    maxSpeedRatio: 0.98,
    maxPredictionError: 72,
    skillUpOnPlayerScore: 0.08,
    skillDownOnPlayerMiss: 0.1,
    skillUpPerLongRally: 0.025,
    rallyHitThreshold: 6,
  },
};
