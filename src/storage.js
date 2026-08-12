/**
 * 出題設定の永続化。
 * DOM に依存しない。localStorage が使えない環境（プライベートモード等）でも
 * 例外で止まらないよう、読み書きは失敗しても既定値で動き続ける。
 */

import {
  FRET_LIMIT,
  INTERVALS,
  INTERVAL_NAMINGS,
  MAX_STRING_COUNT,
  STRING_COUNTS,
  TUNING_OFFSET_LIMIT,
  stringRange,
} from './music.js';
import { DEFAULT_SETTINGS, MODES, QUIZ_TYPES } from './quiz.js';

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

  if (Object.values(MODES).includes(raw.mode)) settings.mode = raw.mode;
  if (Object.values(QUIZ_TYPES).includes(raw.quizType)) settings.quizType = raw.quizType;

  if (Object.values(INTERVAL_NAMINGS).includes(raw.intervalNaming)) {
    settings.intervalNaming = raw.intervalNaming;
  }

  if (Array.isArray(raw.intervals)) {
    const ids = INTERVALS.map((interval) => interval.id).filter((id) => raw.intervals.includes(id));
    // 1 つも選ばれていないと相対音モードで出題できないので既定値へ戻す
    if (ids.length > 0) settings.intervals = ids;
  }
  if (STRING_COUNTS.includes(raw.stringCount)) settings.stringCount = raw.stringCount;

  // チューニングは弦ごとの半音差。1 つでも範囲外なら全体を標準へ戻す
  if (Array.isArray(raw.tuning) && raw.tuning.length === MAX_STRING_COUNT) {
    const valid = raw.tuning.every(
      (value) => Number.isInteger(value) && Math.abs(value) <= TUNING_OFFSET_LIMIT,
    );
    if (valid) settings.tuning = [...raw.tuning];
  }

  settings.lefty = raw.lefty === true;
  settings.includeSharps = raw.includeSharps === true;
  settings.includeFlats = raw.includeFlats === true;

  if (Array.isArray(raw.strings)) {
    // 弦の本数を減らしたときに、範囲外の弦番号が残らないようにする
    const strings = stringRange(settings.stringCount).filter((stringNo) =>
      raw.strings.includes(stringNo),
    );
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
        mode: settings.mode,
        quizType: settings.quizType,
        intervals: settings.intervals,
        intervalNaming: settings.intervalNaming,
        stringCount: settings.stringCount,
        lefty: settings.lefty,
        tuning: settings.tuning,
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
