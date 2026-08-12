/**
 * 音楽理論ドメイン。
 * DOM に依存しない。表示用の音名文字列への変換もこのモジュールに閉じ込める。
 */

/** ピッチクラス (0-11) と表示名の対応。♯ 表記と ♭ 表記で同じ位置を別の名前で呼ぶ */
export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** 出題対象にできる音名。ナチュラルは表記が 1 通りなので共通 */
export const NATURAL_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const SHARP_NOTES = ['C#', 'D#', 'F#', 'G#', 'A#'];
export const FLAT_NOTES = ['Db', 'Eb', 'Gb', 'Ab', 'Bb'];

/**
 * 標準チューニング。index 0 が 1弦（最高音）。
 * 7 弦目は 7 弦ギターの標準である Low B（B1）。
 */
export const OPEN_STRING_MIDI = [64, 59, 55, 50, 45, 40, 35];

/** 選べる弦の本数 */
export const STRING_COUNTS = [6, 7];
export const MAX_STRING_COUNT = 7;
export const DEFAULT_STRING_COUNT = 6;

/** 弦番号の配列。本数を渡すとその範囲だけ返す */
export function stringRange(stringCount = DEFAULT_STRING_COUNT) {
  return Array.from({ length: stringCount }, (_, index) => index + 1);
}

export const ALL_STRINGS = stringRange(DEFAULT_STRING_COUNT);

/**
 * 変則チューニング。各弦の標準からの半音差を 1 弦から順に並べる。
 * 標準音そのものを持たず差分で表すのは、6 弦と 7 弦で同じ定義を使い回すため。
 */
export const NO_TUNING_OFFSETS = Array(MAX_STRING_COUNT).fill(0);

export const TUNING_PRESETS = [
  { id: 'standard', label: '標準', offsets: [0, 0, 0, 0, 0, 0, 0] },
  { id: 'dropD', label: 'ドロップ D', offsets: [0, 0, 0, 0, 0, -2, 0] },
  { id: 'dadgad', label: 'DADGAD', offsets: [-2, -2, 0, 0, 0, -2, 0] },
  { id: 'openG', label: 'オープン G', offsets: [-2, 0, 0, 0, -2, -2, 0] },
  { id: 'openD', label: 'オープン D', offsets: [-2, -2, -1, 0, 0, -2, 0] },
  { id: 'halfDown', label: '半音下げ', offsets: [-1, -1, -1, -1, -1, -1, -1] },
  { id: 'wholeDown', label: '全音下げ', offsets: [-2, -2, -2, -2, -2, -2, -2] },
];

/** 各弦を上下できる幅（半音） */
export const TUNING_OFFSET_LIMIT = 12;

export function findTuningPreset(offsets) {
  return TUNING_PRESETS.find((preset) =>
    preset.offsets.every((value, index) => value === (offsets[index] ?? 0)),
  );
}

/** 選択できるフレットの上限（一般的なエレキギターのフルレンジ） */
export const FRET_LIMIT = 24;

/** 初期のフレット範囲 */
export const DEFAULT_FRET_MIN = 0;
export const DEFAULT_FRET_MAX = 7;

/** ポジションマークを描くフレット */
export const SINGLE_INLAY_FRETS = [3, 5, 7, 9, 15, 17, 19, 21];
export const DOUBLE_INLAY_FRETS = [12, 24];

/** 開放弦の MIDI ノート番号（チューニングを反映） */
export function openMidiOf(stringNo, tuning = NO_TUNING_OFFSETS) {
  return OPEN_STRING_MIDI[stringNo - 1] + (tuning?.[stringNo - 1] ?? 0);
}

/** ポジションの MIDI ノート番号 */
export function midiAt(stringNo, fret, tuning = NO_TUNING_OFFSETS) {
  return openMidiOf(stringNo, tuning) + fret;
}

/** ポジションのピッチクラス (0-11) */
export function pitchClassAt(stringNo, fret, tuning = NO_TUNING_OFFSETS) {
  return midiAt(stringNo, fret, tuning) % 12;
}

/** MIDI 番号を「E2」のようなオクターブ付きの音名にする */
export function midiToLabel(midi, useFlats = false) {
  const names = useFlats ? FLAT_NAMES : SHARP_NAMES;
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** 音名（♯ / ♭ どちらの表記でも可）のピッチクラス */
export function pitchClassOf(noteName) {
  const sharp = SHARP_NAMES.indexOf(noteName);
  if (sharp >= 0) return sharp;
  const flat = FLAT_NAMES.indexOf(noteName);
  if (flat >= 0) return flat;
  throw new Error(`unknown note name: ${noteName}`);
}

/** その音名が ♭ 表記かどうか */
export function isFlatName(noteName) {
  return FLAT_NOTES.includes(noteName);
}

/** ポジションの表示用音名。出題中の問題の表記系に合わせる */
export function noteNameAt(stringNo, fret, options = {}) {
  const { useFlats = false, tuning = NO_TUNING_OFFSETS } = options;
  const names = useFlats ? FLAT_NAMES : SHARP_NAMES;
  return names[pitchClassAt(stringNo, fret, tuning)];
}

/**
 * 指定した音名に該当するポジションを、対象の弦とフレット範囲の中から全て返す。
 * range は出題設定オブジェクトをそのまま渡せる形にしている。
 */
export function findPositions(noteName, range = {}) {
  const {
    strings = ALL_STRINGS,
    fretMin = DEFAULT_FRET_MIN,
    fretMax = DEFAULT_FRET_MAX,
    tuning = NO_TUNING_OFFSETS,
  } = range;
  const target = pitchClassOf(noteName);

  const positions = [];
  for (const stringNo of strings) {
    for (let fret = fretMin; fret <= fretMax; fret++) {
      if (pitchClassAt(stringNo, fret, tuning) === target) {
        positions.push({ string: stringNo, fret });
      }
    }
  }
  return positions;
}

/**
 * 音程（度数）。semitones は上行したときの半音数。
 * ja / en は表記の切り替え用。呼び名が違うだけで指す音は同じ。
 *
 * オクターブを超えるテンション（9th 以降）は、実音としては 1 オクターブ内の
 * 度数と同じ音名を指す（9th = 長2度）。呼び名を覚えるための別問題として扱う。
 * 「♭9th 下」のような言い方は実用しないため、テンションは上行のみにする。
 */
export const INTERVALS = [
  { id: 'm2', ja: '短2度', en: '♭2nd', semitones: 1 },
  { id: 'M2', ja: '長2度', en: '2nd', semitones: 2 },
  { id: 'm3', ja: '短3度', en: '♭3rd', semitones: 3 },
  { id: 'M3', ja: '長3度', en: '3rd', semitones: 4 },
  { id: 'P4', ja: '完全4度', en: '4th', semitones: 5 },
  { id: 'TT', ja: '三全音', en: '♭5th', semitones: 6 },
  { id: 'P5', ja: '完全5度', en: '5th', semitones: 7 },
  { id: 'm6', ja: '短6度', en: '♭6th', semitones: 8 },
  { id: 'M6', ja: '長6度', en: '6th', semitones: 9 },
  { id: 'm7', ja: '短7度', en: '♭7th', semitones: 10 },
  { id: 'M7', ja: '長7度', en: '7th', semitones: 11 },

  { id: 'b9', ja: '♭9度', en: '♭9th', semitones: 13, upOnly: true },
  { id: '9', ja: '9度', en: '9th', semitones: 14, upOnly: true },
  { id: 's9', ja: '♯9度', en: '♯9th', semitones: 15, upOnly: true },
  { id: '11', ja: '11度', en: '11th', semitones: 17, upOnly: true },
  { id: 's11', ja: '♯11度', en: '♯11th', semitones: 18, upOnly: true },
  { id: 'b13', ja: '♭13度', en: '♭13th', semitones: 20, upOnly: true },
  { id: '13', ja: '13度', en: '13th', semitones: 21, upOnly: true },
];

/** 度数の表記 */
export const INTERVAL_NAMINGS = { JA: 'ja', EN: 'en' };
export const DEFAULT_INTERVAL_NAMING = INTERVAL_NAMINGS.JA;

/** 既定で出題する度数。コードやアルペジオで実際に使う頻度が高いもの */
export const DEFAULT_INTERVAL_IDS = ['m3', 'M3', 'P4', 'P5', 'm7', 'M7'];

/**
 * 度数の組み合わせプリセット。コードの構成音を単位にしてある。
 * どれにも一致しない組み合わせは「カスタマイズ」として扱う。
 */
export const INTERVAL_PRESETS = [
  { id: 'triad', label: '三和音', intervals: ['m3', 'M3', 'P5'] },
  { id: 'seventh', label: '四和音', intervals: ['m3', 'M3', 'P5', 'm7', 'M7'] },
  { id: 'all', label: 'テンションあり（全部）', intervals: INTERVALS.map((i) => i.id) },
];

const sortedKey = (ids) => [...ids].sort().join(',');

export function findIntervalPreset(ids) {
  return INTERVAL_PRESETS.find((preset) => sortedKey(preset.intervals) === sortedKey(ids));
}

export function intervalLabel(interval, naming = DEFAULT_INTERVAL_NAMING) {
  return naming === INTERVAL_NAMINGS.EN ? interval.en : interval.ja;
}

export function findInterval(id) {
  return INTERVALS.find((interval) => interval.id === id);
}

/** 音名を半音単位で移動する。負の値なら下行 */
export function transposeName(noteName, semitones, useFlats = false) {
  const pitchClass = (((pitchClassOf(noteName) + semitones) % 12) + 12) % 12;
  return (useFlats ? FLAT_NAMES : SHARP_NAMES)[pitchClass];
}

/** 各フレットを走査するための配列 */
export function fretRange(fretMin = DEFAULT_FRET_MIN, fretMax = DEFAULT_FRET_MAX) {
  const frets = [];
  for (let fret = fretMin; fret <= fretMax; fret++) frets.push(fret);
  return frets;
}

/**
 * フレット列の幅の比率。実物のギターでは弦長が 1 フレットごとに 2^(-1/12) 倍に
 * なるため、フレット間隔も同じ比率で縮む。範囲の途中から始まる場合も、
 * 絶対的なフレット番号を基準にして実物どおりの比率を保つ。
 */
export function fretWidthRatio(fret) {
  return Math.pow(2, -(fret - 1) / 12);
}
