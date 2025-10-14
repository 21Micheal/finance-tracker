// src/utils/soundService.js
class SoundService {
  constructor() {
    // Using Web Audio API for better cross-browser compatibility
    this.audioContext = null;
    this.enabled = true;
    this.volume = 0.6;
    this.sounds = {
      success: this.createSuccessSound(),
      warning: this.createWarningSound(),
      alert: this.createAlertSound(),
      notification: this.createNotificationSound(),
      achievement: this.createAchievementSound()
    };
  }

  // Create sound using Web Audio API (no external files needed)
  createSuccessSound() {
    return () => this.playBeep(523.25, 0.3, 'sine'); // C5
  }

  createWarningSound() {
    return () => this.playBeep(349.23, 0.5, 'square'); // F4
  }

  createAlertSound() {
    return () => {
      this.playBeep(392.00, 0.2, 'sawtooth'); // G4
      setTimeout(() => this.playBeep(329.63, 0.2, 'sawtooth'), 200); // E4
    };
  }

  createNotificationSound() {
    return () => this.playBeep(659.25, 0.4, 'triangle'); // E5
  }

  createAchievementSound() {
    return () => {
      this.playBeep(523.25, 0.1, 'sine'); // C5
      setTimeout(() => this.playBeep(659.25, 0.1, 'sine'), 100); // E5
      setTimeout(() => this.playBeep(783.99, 0.1, 'sine'), 200); // G5
    };
  }

  playBeep(frequency, duration, type) {
    if (!this.enabled) return;

    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type;

      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.volume, this.audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch (error) {
      console.log('Web Audio API not supported:', error);
    }
  }

  play(soundType) {
    if (!this.enabled || !this.sounds[soundType]) return;
    this.sounds[soundType]();
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('soundEnabled', this.enabled);
    return this.enabled;
  }

  setVolume(level) {
    this.volume = Math.max(0, Math.min(1, level));
    localStorage.setItem('soundVolume', this.volume);
  }

  initialize() {
    const savedEnabled = localStorage.getItem('soundEnabled');
    const savedVolume = localStorage.getItem('soundVolume');
    
    if (savedEnabled !== null) this.enabled = JSON.parse(savedEnabled);
    if (savedVolume !== null) this.volume = parseFloat(savedVolume);
  }
}

export const soundService = new SoundService();
soundService.initialize();