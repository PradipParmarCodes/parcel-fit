import {GameMusic} from './music';
import type {GameSound} from './sound';

const audioSettingsKey = 'parcel-fit-audio-v1';
const legacyEffectKey = 'parcel-fit-sound';

function volumePreference(saved: unknown, fallback: number): number {
  return typeof saved === 'number' && Number.isFinite(saved)
    ? Math.round(Math.min(100, Math.max(0, saved))) : fallback;
}

function readAudioSettings() {
  const settings = {music: false, effects: true, musicVolume: 35, effectsVolume: 100};
  try {
    settings.effects = localStorage.getItem(legacyEffectKey) !== 'off';
    const saved = JSON.parse(localStorage.getItem(audioSettingsKey) ?? '{}');
    if (typeof saved?.music === 'boolean') settings.music = saved.music;
    if (typeof saved?.effects === 'boolean') settings.effects = saved.effects;
    settings.musicVolume = volumePreference(saved?.musicVolume, settings.musicVolume);
    settings.effectsVolume = volumePreference(saved?.effectsVolume, settings.effectsVolume);
  } catch { /* Preferences are optional when storage is unavailable. */ }
  return settings;
}

export function installSettings(sound: GameSound): (returnFocus?: HTMLElement) => void {
  const dialog = document.getElementById('settings-dialog') as HTMLDialogElement;
  const close = document.getElementById('settings-close') as HTMLButtonElement;
  const musicToggle = document.getElementById('settings-music') as HTMLInputElement;
  const effectsToggle = document.getElementById('settings-effects') as HTMLInputElement;
  const musicVolume = document.getElementById('settings-music-volume') as HTMLInputElement;
  const effectsVolume = document.getElementById('settings-effects-volume') as HTMLInputElement;
  const musicValue = document.getElementById('settings-music-value')!;
  const effectsValue = document.getElementById('settings-effects-value')!;
  const audioStatus = document.getElementById('settings-audio-status')!;
  const track = new GameMusic();
  let trigger: HTMLElement | undefined;
  let interacted = false;

  const saved = readAudioSettings();
  musicToggle.checked = saved.music;
  effectsToggle.checked = saved.effects;
  musicVolume.value = String(saved.musicVolume);
  effectsVolume.value = String(saved.effectsVolume);

  function updateVolume() {
    track.setVolume(musicVolume.valueAsNumber / 100);
    sound.setVolume(effectsVolume.valueAsNumber / 100);
    musicValue.textContent = `${musicVolume.value}%`;
    effectsValue.textContent = `${effectsVolume.value}%`;
  }

  function saveAudioSettings() {
    try {
      localStorage.setItem(audioSettingsKey, JSON.stringify({
        music: musicToggle.checked,
        effects: effectsToggle.checked,
        musicVolume: musicVolume.valueAsNumber,
        effectsVolume: effectsVolume.valueAsNumber,
      }));
      localStorage.setItem(legacyEffectKey, effectsToggle.checked ? 'on' : 'off');
    } catch { /* Audio controls still work when settings cannot be saved. */ }
  }

  function wantsMusic() { return musicToggle.checked && musicVolume.valueAsNumber > 0; }

  function setAudio(report = false, preview = false) {
    if (!effectsToggle.checked) sound.disable();
    if (document.hidden || !wantsMusic()) track.pause();
    if (!interacted || document.hidden || !effectsToggle.checked && !wantsMusic()) return;
    if (effectsToggle.checked) void sound.enable();
    void sound.unlock().then(context => {
      if (document.hidden) return;
      const musicReady = !wantsMusic() || !!context && track.play(context);
      const effectsReady = !effectsToggle.checked || !!context;
      if (report) {
        audioStatus.hidden = musicReady && effectsReady;
        audioStatus.textContent = audioStatus.hidden ? '' : 'Audio is unavailable. You can try again here.';
      }
      if (preview && effectsToggle.checked) sound.play('pick');
    });
  }

  updateVolume();
  function onAudioGesture() { interacted = true; setAudio(); }
  window.addEventListener('pointerdown', onAudioGesture, true);
  window.addEventListener('pointerup', onAudioGesture, true);
  window.addEventListener('keydown', onAudioGesture, true);
  document.addEventListener('visibilitychange', () => setAudio());

  musicToggle.onchange = effectsToggle.onchange = event => {
    interacted = true;
    audioStatus.hidden = true;
    saveAudioSettings();
    setAudio(true, event.currentTarget === effectsToggle);
  };
  musicVolume.oninput = effectsVolume.oninput = () => {
    updateVolume();
    setAudio();
  };
  musicVolume.onchange = effectsVolume.onchange = saveAudioSettings;

  close.onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => trigger?.focus({preventScroll: true}));

  return returnFocus => {
    if (dialog.open) return;
    trigger = returnFocus ?? (document.activeElement as HTMLElement | null) ?? undefined;
    dialog.showModal();
  };
}
