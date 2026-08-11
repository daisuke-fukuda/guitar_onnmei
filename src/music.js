/**
 * 音楽理論ドメイン。
 * DOM に依存しない。表示用の音名文字列への変換もこのモジュールに閉じ込める。
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** ナチュラル音のみを出題対象とする */
export const NATURAL_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** 標準チューニング。index 0 が 1弦（最高音）、index 5 が 6弦（最低音） */
export const OPEN_STRING_MIDI = [64, 59, 55, 50, 45, 40];

export const STRING_COUNT = OPEN_STRING_MIDI.length;
export const FRET_MIN = 0;
export const FRET_MAX = 7;

/** ポジションマークを描くフレット */
export const SINGLE_INLAY_FRETS = [3, 5, 7, 9];
export const DOUBLE_INLAY_FRET = 12;

/** ポジションの MIDI ノート番号 */
export function midiAt(stringNo, fret) {
  return OPEN_STRING_MIDI[stringNo - 1] + fret;
}

/** ポジションのピッチクラス (0-11) */
export function pitchClassAt(stringNo, fret) {
  return midiAt(stringNo, fret) % 12;
}

/** ポジションの表示用音名 */
export function noteNameAt(stringNo, fret) {
  return NOTE_NAMES[pitchClassAt(stringNo, fret)];
}

/** 指定した音名に該当するポジションを全て返す */
export function findPositions(noteName) {
  const target = NOTE_NAMES.indexOf(noteName);
  if (target < 0) throw new Error(`unknown note name: ${noteName}`);

  const positions = [];
  for (let stringNo = 1; stringNo <= STRING_COUNT; stringNo++) {
    for (let fret = FRET_MIN; fret <= FRET_MAX; fret++) {
      if (pitchClassAt(stringNo, fret) === target) {
        positions.push({ string: stringNo, fret });
      }
    }
  }
  return positions;
}

/** 各フレットを走査するための配列 */
export function fretRange() {
  const frets = [];
  for (let fret = FRET_MIN; fret <= FRET_MAX; fret++) frets.push(fret);
  return frets;
}
