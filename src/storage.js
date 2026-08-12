/**
 * 出題設定の永続化。
 * DOM に依存しない。localStorage が使えない環境（プライベートモード等）でも
 * 例外で止まらないよう、読み書きは失敗しても既定値で動き続ける。
 */

import { ALL_STRINGS, FRET_LIMIT } from './music.js';
import { DEFAULT_SETTINGS } from './quiz.js';

const STORAGE_KEY = 'guitar-onnmei:settings';

function isValidFret(value) {
  return Number.isInteger(value) && value >= 0 && value <= FRET_LIMIT;
}

/**
 * 保存値を検証して正規化する。
 * 保存後にフレット上限が変わる・手で書き換えられるといったことが起こりうるため、
 * 壊れた項目だけを既定値に落とし、残りは活かす。
 */
function normalize(raw) {
  const settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return settings;

  settings.includeSharps = raw.includeSharps === true;
  settings.includeFlats = raw.includeFlats === true;

  if (Array.isArray(raw.strings)) {
    const strings = ALL_STRINGS.filter((stringNo) => raw.strings.includes(stringNo));
    // 1 本も選ばれていない設定は出題できないので既定値へ戻す
    if (strings.length > 0) settings.strings = strings;
  }

  if (isValidFret(raw.fretMin) && isValidFret(raw.fretMax) && raw.fretMin <= raw.fretMax) {
    settings.fretMin = raw.fretMin;
    settings.fretMax = raw.fretMax;
  }

  return settings;
}

/** 保存された設定を読む。無い・壊れている場合は既定値を返す */
export function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return normalize(stored ? JSON.parse(stored) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 設定を保存する。失敗しても操作は続行させる */
export function saveSettings(settings) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        includeSharps: settings.includeSharps,
        includeFlats: settings.includeFlats,
        strings: settings.strings,
        fretMin: settings.fretMin,
        fretMax: settings.fretMax,
      }),
    );
  } catch {
    // 保存できなくてもプレイには影響しないため握りつぶす
  }
}
