/**
 * 指板の描画とクリックイベントの発行。
 * セルは初期化時に一度だけ生成し、以後は class の付け外しだけで状態を切り替える。
 */

import {
  DOUBLE_INLAY_FRET,
  FRET_MIN,
  SINGLE_INLAY_FRETS,
  STRING_COUNT,
  fretRange,
} from './music.js';

/** ポジションマークの丸印を、どの弦のセルの下辺に描くか */
const SINGLE_INLAY_STRING = 3;
const DOUBLE_INLAY_STRINGS = [2, 4];

function inlayClass(stringNo, fret) {
  if (fret === DOUBLE_INLAY_FRET && DOUBLE_INLAY_STRINGS.includes(stringNo)) return 'has-inlay';
  if (SINGLE_INLAY_FRETS.includes(fret) && stringNo === SINGLE_INLAY_STRING) return 'has-inlay';
  return '';
}

export function createFretboard(root, onCellClick) {
  const cells = new Map();
  const frets = fretRange();

  // 開放弦列は固定幅、残りのフレット列は等分する。
  // フレット数が少ないときにセルが横へ間延びしないよう、列数を CSS 側の上限計算にも渡す。
  const fretColumns = frets.length - 1;
  root.style.setProperty('--fret-columns', String(fretColumns));
  root.style.gridTemplateColumns =
    `var(--label-w) var(--open-w) repeat(${fretColumns}, minmax(0, 1fr))`;

  // 板とナット部分の下地。セルの行より上下に少しはみ出させるため独立要素にする
  for (const className of ['board-bg', 'nut-bg']) {
    const layer = document.createElement('div');
    layer.className = className;
    layer.setAttribute('aria-hidden', 'true');
    root.appendChild(layer);
  }

  for (let stringNo = 1; stringNo <= STRING_COUNT; stringNo++) {
    const label = document.createElement('div');
    label.className = 'string-label';
    label.textContent = `${stringNo}弦`;
    root.appendChild(label);

    for (const fret of frets) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = ['cell', `s${stringNo}`, fret === FRET_MIN ? 'is-open' : '', inlayClass(stringNo, fret)]
        .filter(Boolean)
        .join(' ');
      cell.dataset.string = String(stringNo);
      cell.dataset.fret = String(fret);
      cell.setAttribute('aria-label', `${stringNo}弦 ${fret}フレット`);
      root.appendChild(cell);
      cells.set(`${stringNo}-${fret}`, cell);
    }
  }

  const numberSpacer = document.createElement('div');
  numberSpacer.className = 'fret-number-spacer';
  root.appendChild(numberSpacer);

  for (const fret of frets) {
    const number = document.createElement('div');
    number.className = 'fret-number';
    number.textContent = String(fret);
    root.appendChild(number);
  }

  root.addEventListener('click', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell || !root.contains(cell)) return;
    onCellClick(Number(cell.dataset.string), Number(cell.dataset.fret));
  });

  return {
    /** セルを正解 / 誤答状態にし、音名ラベルを出す */
    markCell(stringNo, fret, type, noteName) {
      const cell = cells.get(`${stringNo}-${fret}`);
      if (!cell) return;
      cell.classList.add(type === 'correct' ? 'is-correct' : 'is-wrong');
      cell.textContent = noteName;
    },

    /** 全セルを未回答状態へ戻す */
    reset() {
      for (const cell of cells.values()) {
        cell.classList.remove('is-correct', 'is-wrong');
        cell.textContent = '';
      }
    },

    /** 回答受付の可否を切り替える */
    setInteractive(enabled) {
      root.classList.toggle('is-locked', !enabled);
      for (const cell of cells.values()) {
        cell.disabled = !enabled;
      }
    },
  };
}
