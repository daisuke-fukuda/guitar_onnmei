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

/** 標準チューニング。index 0 が 1弦（最高音）、index 5 が 6弦（最低音） */
export const OPEN_STRING_MIDI = [64, 59, 55, 50, 45, 40];

export const STRING_COUNT = OPEN_STRING_MIDI.length;
export const ALL_STRINGS = [1, 2, 3, 4, 5, 6];

/** 選択できるフレットの上限（一般的なエレキギターのフルレンジ） */
export const FRET_LIMIT = 24;

/** 初期のフレット範囲 */
export const DEFAULT_FRET_MIN = 0;
export const DEFAULT_FRET_MAX = 7;

/** ポジションマークを描くフレット */
export const SINGLE_INLAY_FRETS = [3, 5, 7, 9, 15, 17, 19, 21];
export const DOUBLE_INLAY_FRETS = [12, 24];

/** ポジションの MIDI ノート番号 */
export function midiAt(stringNo, fret) {
  return OPEN_STRING_MIDI[stringNo - 1] + fret;
}

/** ポジションのピッチクラス (0-11) */
export function pitchClassAt(stringNo, fret) {
  return midiAt(stringNo, fret) % 12;
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
export function noteNameAt(stringNo, fret, useFlats = false) {
  const names = useFlats ? FLAT_NAMES : SHARP_NAMES;
  return names[pitchClassAt(stringNo, fret)];
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
  } = range;
  const target = pitchClassOf(noteName);

  const positions = [];
  for (const stringNo of strings) {
    for (let fret = fretMin; fret <= fretMax; fret++) {
      if (pitchClassAt(stringNo, fret) === target) {
        positions.push({ string: stringNo, fret });
      }
    }
  }
  return positions;
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
