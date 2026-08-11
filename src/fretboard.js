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

/**
 * ポジションマークを描く位置をグリッドの行範囲で表す。
 * 実物のインレイと同じく弦と弦の境目に置くため、行の境界が中央に来る範囲を指定する。
 */
const SINGLE_INLAY_ROWS = [[3, 5]]; // 3弦と4弦の間
const DOUBLE_INLAY_ROWS = [
  [2, 4], // 2弦と3弦の間
  [4, 6], // 4弦と5弦の間
];

function inlayRowsFor(fret) {
  if (fret === DOUBLE_INLAY_FRET) return DOUBLE_INLAY_ROWS;
  if (SINGLE_INLAY_FRETS.includes(fret)) return SINGLE_INLAY_ROWS;
  return [];
}

export function createFretboard(root, onCellClick) {
  const cells = new Map();
  const frets = fretRange();

  // 開放弦列は固定幅。フレット列は実物のギターと同じ比率で、高音側ほど狭くする。
  // 弦長は 1 フレットごとに 2^(-1/12) 倍になるため、フレット間隔も同じ比率で縮む。
  const fretColumns = frets.length - 1;
  const ratios = [];
  for (let i = 0; i < fretColumns; i++) ratios.push(Math.pow(2, -i / 12));

  root.style.gridTemplateColumns = [
    'var(--label-w)',
    'var(--open-w)',
    ...ratios.map((ratio) => `${ratio.toFixed(4)}fr`),
  ].join(' ');

  // 板とナット部分の下地。セルの行より上下に少しはみ出させるため独立要素にする
  for (const className of ['board-bg', 'nut-bg']) {
    const layer = document.createElement('div');
    layer.className = className;
    layer.setAttribute('aria-hidden', 'true');
    root.appendChild(layer);
  }

  // ポジションマークはセルより下のレイヤーに敷く。
  // 正解・誤答の色が上に来るため、実物で指を置いたときと同じくマークが隠れる。
  for (const fret of frets) {
    for (const [rowStart, rowEnd] of inlayRowsFor(fret)) {
      const inlay = document.createElement('div');
      inlay.className = 'inlay';
      inlay.setAttribute('aria-hidden', 'true');
      // 絶対配置のグリッドアイテムは終端を省くと auto（コンテナ端）扱いになるため span を明示する
      inlay.style.gridColumn = `${fret - FRET_MIN + 2} / span 1`;
      inlay.style.gridRow = `${rowStart} / ${rowEnd}`;
      root.appendChild(inlay);
    }
  }

  for (let stringNo = 1; stringNo <= STRING_COUNT; stringNo++) {
    const label = document.createElement('div');
    label.className = 'string-label';
    label.textContent = `${stringNo}弦`;
    root.appendChild(label);

    for (const fret of frets) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = ['cell', `s${stringNo}`, fret === FRET_MIN ? 'is-open' : '']
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
