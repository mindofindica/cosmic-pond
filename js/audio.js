import { clamp } from './utils.js';
import { showToast } from './ui.js';

// Frequency bands (Hz)
const BANDS = {
  lows: { min: 20, max: 250 },
  mids: { min: 250, max: 4000 },
  highs: { min: 4000, max: 20000 },
};

// Slow envelope followers (long release for organic feel)
const envelopes = {
  lows: { value: 0, lastEnergy: 0 },
  mids: { value: 0, lastEnergy: 0 },
  highs: { value: 0, lastEnergy: 0 },
  overall: { value: 0, lastEnergy: 0 },
};

// Trippy state — slow-moving properties
const trippy = {
  breath: 0,
  breathTarget: 0,
  hueRotation: 0,
  sparkle: 0,
  sparkleTarget: 0,
  swirl: 0,
  swirlTarget: 0,
  connectionBoost: 0,
  connectionTarget: 0,
};

export const audioState = {
  audioContext: null,
  analyser: null,
  dataArray: null,
  audioActive: false,
  audioThreshold: 30,
  isCalibrating: false,
  envelopes,
  trippy,
};

function getBinIndex(frequency, sampleRate, fftSize) {
  return Math.round(frequency / (sampleRate / fftSize));
}

function getBandEnergy(band, dataArray, sampleRate, fftSize) {
  const minBin = getBinIndex(band.min, sampleRate, fftSize);
  const maxBin = getBinIndex(band.max, sampleRate, fftSize);

  let sum = 0;
  let count = 0;
  for (let i = minBin; i <= maxBin && i < dataArray.length; i += 1) {
    sum += dataArray[i];
    count += 1;
  }

  return count > 0 ? sum / count : 0;
}

function updateEnvelope(envelope, currentEnergy, attack, release) {
  if (currentEnergy > envelope.value) {
    envelope.value += (currentEnergy - envelope.value) * attack;
  } else {
    envelope.value += (currentEnergy - envelope.value) * release;
  }
  envelope.lastEnergy = currentEnergy;
  return envelope.value;
}

export function analyzeAudio() {
  if (!audioState.analyser || !audioState.audioActive) return;

  audioState.analyser.getByteFrequencyData(audioState.dataArray);
  const sampleRate = audioState.audioContext.sampleRate;
  const fftSize = audioState.analyser.fftSize;

  const lowsEnergy = Math.max(0, getBandEnergy(BANDS.lows, audioState.dataArray, sampleRate, fftSize) - audioState.audioThreshold);
  const midsEnergy = Math.max(0, getBandEnergy(BANDS.mids, audioState.dataArray, sampleRate, fftSize) - audioState.audioThreshold);
  const highsEnergy = Math.max(0, getBandEnergy(BANDS.highs, audioState.dataArray, sampleRate, fftSize) - audioState.audioThreshold);
  const overallEnergy = (lowsEnergy + midsEnergy + highsEnergy) / 3;

  updateEnvelope(envelopes.lows, lowsEnergy, 0.08, 0.015);
  updateEnvelope(envelopes.mids, midsEnergy, 0.03, 0.008);
  updateEnvelope(envelopes.highs, highsEnergy, 0.1, 0.02);
  updateEnvelope(envelopes.overall, overallEnergy, 0.05, 0.01);

  const normLows = Math.min(1, envelopes.lows.value / 150);
  const normMids = Math.min(1, envelopes.mids.value / 150);
  const normHighs = Math.min(1, envelopes.highs.value / 150);
  const normOverall = Math.min(1, envelopes.overall.value / 150);

  trippy.breathTarget = normLows;
  trippy.breath += (trippy.breathTarget - trippy.breath) * 0.03;

  trippy.hueRotation += normMids * 0.8;

  trippy.sparkleTarget = normHighs;
  trippy.sparkle += (trippy.sparkleTarget - trippy.sparkle) * 0.04;

  trippy.connectionTarget = normHighs * 40;
  trippy.connectionBoost += (trippy.connectionTarget - trippy.connectionBoost) * 0.03;

  trippy.swirlTarget = normOverall;
  trippy.swirl += (trippy.swirlTarget - trippy.swirl) * 0.02;
}

async function calibrateAudio() {
  if (!audioState.analyser) return;

  audioState.isCalibrating = true;
  showToast('calibrating... stay quiet');

  const samples = [];
  const sampleDuration = 2500;
  const sampleInterval = 50;
  const sampleCount = sampleDuration / sampleInterval;

  for (let i = 0; i < sampleCount; i += 1) {
    audioState.analyser.getByteFrequencyData(audioState.dataArray);
    const sampleRate = audioState.audioContext.sampleRate;
    const fftSize = audioState.analyser.fftSize;

    const avgEnergy = (
      getBandEnergy(BANDS.lows, audioState.dataArray, sampleRate, fftSize)
      + getBandEnergy(BANDS.mids, audioState.dataArray, sampleRate, fftSize)
      + getBandEnergy(BANDS.highs, audioState.dataArray, sampleRate, fftSize)
    ) / 3;

    samples.push(avgEnergy);
    await new Promise((resolve) => setTimeout(resolve, sampleInterval));
  }

  const avgNoise = samples.reduce((a, b) => a + b, 0) / samples.length;
  audioState.audioThreshold = avgNoise + 10;

  audioState.isCalibrating = false;
  showToast('ready!');
}

export async function toggleAudio() {
  const micButton = document.getElementById('micButton');

  if (!audioState.audioActive) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioState.analyser = audioState.audioContext.createAnalyser();
      audioState.analyser.fftSize = 4096;
      audioState.analyser.smoothingTimeConstant = 0.3;

      const source = audioState.audioContext.createMediaStreamSource(stream);
      source.connect(audioState.analyser);

      audioState.dataArray = new Uint8Array(audioState.analyser.frequencyBinCount);

      audioState.audioActive = true;
      micButton.classList.add('active');

      await calibrateAudio();
    } catch (err) {
      console.error('Microphone error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showToast('mic blocked — check permissions');
      } else if (err.name === 'NotFoundError') {
        showToast('no microphone found');
      } else {
        showToast(`mic error: ${err.message}`);
      }
    }
  } else {
    audioState.audioActive = false;
    micButton.classList.remove('active');

    if (audioState.audioContext) {
      audioState.audioContext.close();
      audioState.audioContext = null;
    }

    audioState.analyser = null;
    audioState.dataArray = null;

    for (const key in envelopes) {
      envelopes[key].value = 0;
      envelopes[key].lastEnergy = 0;
    }

    trippy.breath = 0;
    trippy.breathTarget = 0;
    trippy.hueRotation = 0;
    trippy.sparkle = 0;
    trippy.sparkleTarget = 0;
    trippy.swirl = 0;
    trippy.swirlTarget = 0;
    trippy.connectionBoost = 0;
    trippy.connectionTarget = 0;
  }
}

export function canAdjustThreshold() {
  return audioState.audioActive && !audioState.isCalibrating;
}

export function adjustThreshold(delta) {
  audioState.audioThreshold = clamp(audioState.audioThreshold + delta, 5, 100);
  return audioState.audioThreshold;
}
