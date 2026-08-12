/**
 * 指板の描画とクリックイベントの発行。
 * フレット範囲が変わると列構成そのものが変わるため、範囲ごとに組み直す。
 * 同じ範囲のままなら再生成せず、class の付け外しだけで状態を切り替える。
 */

import {
  ALL_STRINGS,
  DEFAULT_FRET_MAX,
  DEFAULT_FRET_MIN,
  DOUBLE_INLAY_FRETS,
  SINGLE_INLAY_FRETS,
  STRING_COUNT,
  fretRange,
  fretWidthRatio,
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
  if (DOUBLE_INLAY_FRETS.includes(fret)) return DOUBLE_INLAY_ROWS;
  if (SINGLE_INLAY_FRETS.includes(fret)) return SINGLE_INLAY_ROWS;
  return [];
}

export function createFretboard(root, onCellClick) {
  let cells = new Map();
  let labels = new Map();
  let fretMin = DEFAULT_FRET_MIN;
  let fretMax = DEFAULT_FRET_MAX;

  // 出題対象の弦。対象外は暗く沈めてクリックを受け付けない
  let activeStrings = new Set(ALL_STRINGS);
  let interactive = false;

  function applyDisabled() {
    for (const cell of cells.values()) {
      cell.disabled = !interactive || !activeStrings.has(Number(cell.dataset.string));
    }
  }

  function applyMuted() {
    for (const cell of cells.values()) {
      cell.classList.toggle('is-muted', !activeStrings.has(Number(cell.dataset.string)));
    }
    for (const [stringNo, label] of labels) {
      label.classList.toggle('is-muted', !activeStrings.has(stringNo));
    }
  }

  function build() {
    root.textContent = '';
    cells = new Map();
    labels = new Map();

    const frets = fretRange(fretMin, fretMax);
    // 0 フレットは押弦位置ではなく開放弦なので、幅の比率ではなく固定幅の列にする
    const hasOpenColumn = frets[0] === 0;
    const frettedColumns = frets.filter((fret) => fret > 0);

    root.classList.toggle('has-open-column', hasOpenColumn);
    root.style.gridTemplateColumns = [
      'var(--label-w)',
      hasOpenColumn ? 'var(--open-w)' : '',
      ...frettedColumns.map((fret) => `${fretWidthRatio(fret).toFixed(4)}fr`),
    ]
      .filter(Boolean)
      .join(' ');

    // 列が細くなりすぎないよう下限を敷き、超えた分は指板だけ横スクロールさせる
    root.style.setProperty('--fret-columns', String(frettedColumns.length));

    /** グリッド上の列番号（1 始まり）。1 列目は弦ラベル */
    const columnOf = (fret) => frets.indexOf(fret) + 2;

    // 板とナット部分の下地。セルの行より上下に少しはみ出させるため独立要素にする
    for (const className of hasOpenColumn ? ['board-bg', 'nut-bg'] : ['board-bg']) {
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
        inlay.style.gridColumn = `${columnOf(fret)} / span 1`;
        inlay.style.gridRow = `${rowStart} / ${rowEnd}`;
        root.appendChild(inlay);
      }
    }

    for (let stringNo = 1; stringNo <= STRING_COUNT; stringNo++) {
      const label = document.createElement('div');
      label.className = 'string-label';
      label.textContent = `${stringNo}弦`;
      root.appendChild(label);
      labels.set(stringNo, label);

      for (const fret of frets) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = ['cell', `s${stringNo}`, fret === 0 ? 'is-open' : '']
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

    applyMuted();
    applyDisabled();
  }

  build();

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

    /** 表示するフレット範囲を設定する。変化があったときだけ組み直す */
    setFretRange(nextMin, nextMax) {
      if (nextMin === fretMin && nextMax === fretMax) return;
      fretMin = nextMin;
      fretMax = nextMax;
      build();
    },

    /** 回答受付の可否を切り替える */
    setInteractive(enabled) {
      interactive = enabled;
      root.classList.toggle('is-locked', !enabled);
      applyDisabled();
    },

    /** 出題対象の弦を設定する。対象外の弦は暗く沈め、クリックを受け付けない */
    setActiveStrings(strings) {
      activeStrings = new Set(strings);
      applyMuted();
      applyDisabled();
    },
  };
}
