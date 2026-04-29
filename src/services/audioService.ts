class AudioService {
  private audioContext: AudioContext | null = null;
  private playlist: HTMLAudioElement[] = [];
  private currentPlaylistIndex: number = 0;
  private atariMusic: HTMLAudioElement | null = null;
  private infinityMusic: HTMLAudioElement | null = null;
  private victoryMusic: HTMLAudioElement | null = null;
  private gameOverSound: HTMLAudioElement | null = null;
  private currentMusic: HTMLAudioElement | null = null;
  private isMuted: boolean = false;
  private isPlaylistMode: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const LOCAL_DATA = '/data/';
      
      const playlistFiles = [
        'copper_bars.mp3',
        'Music2.mp3',
        'Music3.mp3',
        'Music4.mp3',
        'Music5.mp3',
        'Music6.mp3',
        'Music7.mp3',
        'Music8.mp3',
        'Music9.mp3',
        'Music10.mp3'
      ];

      playlistFiles.forEach((file, index) => {
        const audio = new Audio(LOCAL_DATA + encodeURIComponent(file));
        audio.volume = 0.6;
        audio.addEventListener('timeupdate', () => {
          // Crossfade: If we're within 3 seconds of the end, start prepping/playing next track
          if (audio.duration && audio.currentTime > audio.duration - 3 && this.isPlaylistMode && !this.isMuted) {
            this.handleCrossfade();
          }
        });
        audio.addEventListener('ended', () => this.handleTrackEnded());
        this.playlist.push(audio);
      });

      this.atariMusic = new Audio(LOCAL_DATA + encodeURIComponent('Coppe_ Bar_ at_Dawn_Chip.mp3'));
      this.atariMusic.loop = true;
      this.atariMusic.volume = 0.6;

      this.infinityMusic = new Audio(LOCAL_DATA + encodeURIComponent('Copper_Bars_at_Dawn_Infinity.mp3'));
      this.infinityMusic.loop = true;
      this.infinityMusic.volume = 0.6;

      this.victoryMusic = new Audio(LOCAL_DATA + encodeURIComponent('The_End.mp3'));
      this.victoryMusic.loop = false;
      this.victoryMusic.volume = 0.6;
      
      this.gameOverSound = new Audio(LOCAL_DATA + encodeURIComponent('game_over.mp3'));
      this.gameOverSound.volume = 0.6;
    }
  }

  private isCrossfading: boolean = false;

  private async handleCrossfade() {
    if (this.isCrossfading) return;
    this.isCrossfading = true;

    const nextIndex = (this.currentPlaylistIndex + 1) % this.playlist.length;
    const nextTrack = this.playlist[nextIndex];
    
    // Start fading out current
    const currentTrack = this.playlist[this.currentPlaylistIndex];
    const fadeInterval = setInterval(() => {
      if (currentTrack.volume > 0.05) {
        currentTrack.volume -= 0.05;
      } else {
        currentTrack.pause();
        currentTrack.volume = 0.6;
        clearInterval(fadeInterval);
      }
    }, 200);

    // Start next track
    this.currentPlaylistIndex = nextIndex;
    this.currentMusic = nextTrack;
    try {
      nextTrack.currentTime = 0;
      nextTrack.volume = 0;
      await nextTrack.play();
      
      // Fade in next
      const fadeInInterval = setInterval(() => {
        if (nextTrack.volume < 0.6) {
          nextTrack.volume += 0.05;
        } else {
          nextTrack.volume = 0.6;
          clearInterval(fadeInInterval);
          this.isCrossfading = false;
        }
      }, 200);
    } catch (e) {
      console.error("Crossfade playback failed:", e);
      this.isCrossfading = false;
    }
  }

  private async handleTrackEnded() {
    if (this.isPlaylistMode && !this.isMuted && !this.isCrossfading) {
      this.currentPlaylistIndex = (this.currentPlaylistIndex + 1) % this.playlist.length;
      const nextTrack = this.playlist[this.currentPlaylistIndex];
      this.currentMusic = nextTrack;
      try {
        nextTrack.currentTime = 0;
        await nextTrack.play();
      } catch (e) {
        console.error("Next track playback failed:", e);
      }
    }
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.pauseMusic();
    }
  }

  async resumeContext() {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  async playMusic(level?: number, isInfinity?: boolean) {
    if (this.isMuted) return;
    
    let targetMusic: HTMLAudioElement | null = null;
    this.isPlaylistMode = false;

    if (level === 3) {
      targetMusic = this.atariMusic;
    } else if (isInfinity) {
      targetMusic = this.infinityMusic;
    } else {
      this.isPlaylistMode = true;
      targetMusic = this.playlist[this.currentPlaylistIndex];
    }
    
    if (this.currentMusic && this.currentMusic !== targetMusic) {
      this.currentMusic.pause();
    }

    const isNewTrack = this.currentMusic !== targetMusic;
    this.currentMusic = targetMusic;

    if (this.currentMusic) {
      try {
        if (this.audioContext?.state === 'suspended') {
          await this.audioContext.resume();
        }
        
        if (isNewTrack) {
          this.currentMusic.currentTime = 0;
        }
        
        // Always try to play if we want music
        await this.currentMusic.play();
      } catch (e) {
        console.error("Playback failed:", e);
        this.playIntro();
      }
    }
  }

  async resumeMusic() {
    if (this.isMuted || !this.currentMusic) return;
    try {
      if (this.audioContext?.state === 'suspended') {
        await this.audioContext.resume();
      }
      await this.currentMusic.play();
    } catch (e) {
      console.error("Resume failed:", e);
    }
  }

  playIntro() {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    
    // Simple retro arpeggio
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      gain.gain.setValueAtTime(0.03, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.2);
      osc.connect(gain);
      gain.connect(this.audioContext!.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.2);
    });
  }

  async playGameOver() {
    if (this.isMuted) return;
    if (this.gameOverSound) {
      try {
        this.stopMusic();
        if (this.audioContext?.state === 'suspended') {
          await this.audioContext.resume();
        }
        this.gameOverSound.currentTime = 0;
        await this.gameOverSound.play();
      } catch (e) {
        console.error("Game over sound playback failed:", e);
      }
    }
  }

  async playVictoryMusic() {
    if (this.isMuted) return;
    if (this.victoryMusic) {
      try {
        this.stopMusic();
        if (this.audioContext?.state === 'suspended') {
          await this.audioContext.resume();
        }
        this.victoryMusic.currentTime = 0;
        await this.victoryMusic.play();
      } catch (e) {
        console.error("Victory music playback failed:", e);
      }
    }
  }

  stopGameOver() {
    if (this.gameOverSound) {
      this.gameOverSound.pause();
      this.gameOverSound.currentTime = 0;
    }
  }

  stopMusic() {
    this.isPlaylistMode = false;
    if (this.playlist) this.playlist.forEach(a => a.pause());
    if (this.atariMusic) this.atariMusic.pause();
    if (this.infinityMusic) this.infinityMusic.pause();
    if (this.victoryMusic) this.victoryMusic.pause();
    this.currentMusic = null;
  }

  pauseMusic() {
    if (this.currentMusic) {
      this.currentMusic.pause();
    }
  }

  // Synthesize retro sound effects using Web Audio API
  playSfx(type: 'hit' | 'paddle' | 'wall' | 'powerup' | 'lose' | 'explosion' | 'portal' | 'laser') {
    if (!this.audioContext || this.isMuted) return;
    
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    const now = this.audioContext.currentTime;
    
    switch (type) {
      case 'hit':
        this.playHitSound();
        break;
      case 'paddle':
        const pOsc = this.audioContext.createOscillator();
        const pGain = this.audioContext.createGain();
        pOsc.connect(pGain);
        pGain.connect(this.audioContext.destination);
        pOsc.type = 'triangle';
        pOsc.frequency.setValueAtTime(200, now);
        pOsc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
        pGain.gain.setValueAtTime(0.24, now);
        pGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        pOsc.start(now);
        pOsc.stop(now + 0.05);
        break;
      case 'wall':
        const wOsc = this.audioContext.createOscillator();
        const wGain = this.audioContext.createGain();
        wOsc.connect(wGain);
        wGain.connect(this.audioContext.destination);
        wOsc.type = 'sine';
        wOsc.frequency.setValueAtTime(100, now);
        wGain.gain.setValueAtTime(0.12, now);
        wGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        wOsc.start(now);
        wOsc.stop(now + 0.05);
        break;
      case 'powerup':
        const puOsc = this.audioContext.createOscillator();
        const puGain = this.audioContext.createGain();
        puOsc.connect(puGain);
        puGain.connect(this.audioContext.destination);
        puOsc.type = 'sawtooth';
        puOsc.frequency.setValueAtTime(400, now);
        puOsc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
        puGain.gain.setValueAtTime(0.18, now);
        puGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        puOsc.start(now);
        puOsc.stop(now + 0.3);
        break;
      case 'lose':
        const lOsc = this.audioContext.createOscillator();
        const lGain = this.audioContext.createGain();
        lOsc.connect(lGain);
        lGain.connect(this.audioContext.destination);
        lOsc.type = 'square';
        lOsc.frequency.setValueAtTime(100, now);
        lOsc.frequency.linearRampToValueAtTime(20, now + 0.5);
        lGain.gain.setValueAtTime(0.24, now);
        lGain.gain.linearRampToValueAtTime(0.01, now + 0.5);
        lOsc.start(now);
        lOsc.stop(now + 0.5);
        break;
      case 'explosion':
        // Brutal Sub Thump
        const thumpOsc = this.audioContext.createOscillator();
        const thumpGain = this.audioContext.createGain();
        thumpOsc.connect(thumpGain);
        thumpGain.connect(this.audioContext.destination);
        thumpOsc.type = 'sine';
        thumpOsc.frequency.setValueAtTime(80, now);
        thumpOsc.frequency.exponentialRampToValueAtTime(10, now + 1.2);
        thumpGain.gain.setValueAtTime(0.6, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
        thumpOsc.start(now);
        thumpOsc.stop(now + 1.2);

        // Crushing Noise Layer
        const exNoiseBuffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 1.0, this.audioContext.sampleRate);
        const exData = exNoiseBuffer.getChannelData(0);
        for (let i = 0; i < exNoiseBuffer.length; i++) exData[i] = Math.random() * 2 - 1;
        const exSrc = this.audioContext.createBufferSource();
        exSrc.buffer = exNoiseBuffer;

        const exNGain = this.audioContext.createGain();
        const exFilter = this.audioContext.createBiquadFilter();
        exFilter.type = 'lowpass';
        exFilter.frequency.setValueAtTime(2000, now);
        exFilter.frequency.exponentialRampToValueAtTime(50, now + 1.0);
        exFilter.Q.setValueAtTime(10, now); // Add resonance for more "grunt"

        exSrc.connect(exFilter);
        exFilter.connect(exNGain);
        exNGain.connect(this.audioContext.destination);

        exNGain.gain.setValueAtTime(0.4, now);
        exNGain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
        exSrc.start(now);
        exSrc.stop(now + 1.0);

        // High-frequency "shattering" layer
        const shatOsc = this.audioContext.createOscillator();
        const shatGain = this.audioContext.createGain();
        shatOsc.type = 'sawtooth';
        shatOsc.connect(shatGain);
        shatGain.connect(this.audioContext.destination);
        shatOsc.frequency.setValueAtTime(2000, now);
        shatOsc.frequency.linearRampToValueAtTime(200, now + 0.3);
        shatGain.gain.setValueAtTime(0.1, now);
        shatGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        shatOsc.start(now);
        shatOsc.stop(now + 0.3);
        break;
      case 'portal':
        const poOsc = this.audioContext.createOscillator();
        const poGain = this.audioContext.createGain();
        poOsc.connect(poGain);
        poGain.connect(this.audioContext.destination);
        poOsc.type = 'sine';
        poOsc.frequency.setValueAtTime(800, now);
        poOsc.frequency.exponentialRampToValueAtTime(200, now + 0.4);
        poGain.gain.setValueAtTime(0.18, now);
        poGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        poOsc.start(now);
        poOsc.stop(now + 0.4);
        break;
      case 'laser':
        this.playLaserSound(); // Delegated to improved version
        break;
    }
  }

  private playHitSound() {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    
    // Snappy retro hit
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.08);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  private playLaserSound() {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    
    // Punchy short laser sweep
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2000, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
    
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playVoice(text: string) {
    if (typeof window === 'undefined' || this.isMuted || !this.audioContext) return;
    
    // Stop any current speaking
    window.speechSynthesis.cancel();

    // Play System "Handshake" SFX before speaking (quieter)
    this.playSystemHandshake();

    // On mobile, speechSynthesis.getVoices() might be empty initially.
    // We should try to get voices, but proceed even if it's not perfect.
    const voices = window.speechSynthesis.getVoices();
    
    // Priority order for voices - prioritizing deeper male voices
    const preferredVoices = [
      'Google UK English Male', 
      'Microsoft David', 
      'Microsoft James',
      'Google US English Male', 
      'Male',
      'Daniel',
      'en-GB',
      'en-US'
    ];
    
    let voice = voices.find(v => preferredVoices.some(pref => v.name.includes(pref)));
    if (!voice) voice = voices.find(v => v.lang.startsWith('en') && (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('david')));
    if (!voice && voices.length > 0) voice = voices[0];

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 0.7; // Slightly higher to remove hoarseness while remaining deep
    utterance.rate = 0.9;  // Slightly faster for better flow
    utterance.volume = 1.0;
    if (voice) utterance.voice = voice;
    
    // Some mobile browsers need a short delay but MUST be within the same task.
    // Actually, removal of setTimeout is best for iOS.
    window.speechSynthesis.speak(utterance);
  }

  // Call this on user interaction to "unlock" TTS on mobile
  warmUpTTS() {
    if (typeof window === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance("");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
    
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  private playSystemHandshake() {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playBreakSound() {
    if (!this.audioContext || this.isMuted) return;
    if (this.audioContext.state === 'suspended') this.audioContext.resume();
    
    const now = this.audioContext.currentTime;
    const duration = 0.1;
    
    // Sharper "tink" for brick breaking
    const osc = this.audioContext.createOscillator();
    const tGain = this.audioContext.createGain();
    osc.connect(tGain);
    tGain.connect(this.audioContext.destination);
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + duration);
    
    tGain.gain.setValueAtTime(0.06, now);
    tGain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    
    osc.start(now);
    osc.stop(now + duration);
  }

}

export const audioService = new AudioService();
