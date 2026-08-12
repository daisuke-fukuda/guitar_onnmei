/**
 * 指板の描画とクリックイベントの発行。
 * フレット範囲が変わると列構成そのものが変わるため、範囲ごとに組み直す。
 * 同じ範囲のままなら再生成せず、class の付け外しだけで状態を切り替える。
 */

import {
  ALL_STRINGS,
  DEFAULT_FRET_MAX,
  DEFAULT_FRET_MIN,
  DEFAULT_STRING_COUNT,
  DOUBLE_INLAY_FRETS,
  SINGLE_INLAY_FRETS,
  fretRange,
  fretWidthRatio,
} from './music.js';

/**
 * ポジションマークを描く位置をグリッドの行範囲で表す。
 * 実物のインレイと同じく指板の中心へ置くため、指定した行範囲の中央に丸を描く。
 * 6 弦は行数が偶数なので 3〜4 弦の境目、7 弦は奇数なので 4 弦の中央が中心になる。
 */
const INLAY_ROWS = {
  6: { single: [[3, 5]], double: [[2, 4], [4, 6]] },
  7: { single: [[4, 5]], double: [[2, 4], [5, 7]] },
};

function inlayRowsFor(fret, stringCount) {
  const rows = INLAY_ROWS[stringCount] ?? INLAY_ROWS[DEFAULT_STRING_COUNT];
  if (DOUBLE_INLAY_FRETS.includes(fret)) return rows.double;
  if (SINGLE_INLAY_FRETS.includes(fret)) return rows.single;
  return [];
}

export function createFretboard(root, onCellClick) {
  let cells = new Map();
  let labels = new Map();
  let stringCount = DEFAULT_STRING_COUNT;
  let fretMin = DEFAULT_FRET_MIN;
  let fretMax = DEFAULT_FRET_MAX;
  // 左利き: ナットを右に置き、フレットが右から左へ並ぶ
  let lefty = false;

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

    // 左利きは列の並びごと反転する。弦ラベルもナット側（右）へ回す
    const orderedFrets = lefty ? [...frets].reverse() : frets;
    const columnSizes = [
      'var(--label-w)',
      hasOpenColumn ? 'var(--open-w)' : '',
      ...frettedColumns.map((fret) => `minmax(0, ${fretWidthRatio(fret).toFixed(4)}fr)`),
    ].filter(Boolean);

    root.classList.toggle('is-lefty', lefty);

    // minmax(0, …) にしないと、セル内の音名がそのまま列の下限になって
    // 画面幅からはみ出す。横スクロールを出さないため必ず 0 まで縮められるようにする
    root.style.gridTemplateColumns = (lefty ? [...columnSizes].reverse() : columnSizes).join(' ');

    root.style.gridTemplateRows = `repeat(${stringCount}, var(--row-h)) var(--number-h)`;

    // 列が増えて 1 マスが狭くなったときは文字を小さくする
    root.classList.toggle('is-dense', frettedColumns.length > 10);

    /** グリッド上の列番号（1 始まり）。弦ラベルは右利きなら先頭、左利きなら末尾 */
    const columnOf = (fret) => orderedFrets.indexOf(fret) + (lefty ? 1 : 2);

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
      for (const [rowStart, rowEnd] of inlayRowsFor(fret, stringCount)) {
        const inlay = document.createElement('div');
        inlay.className = 'inlay';
        inlay.setAttribute('aria-hidden', 'true');
        // 絶対配置のグリッドアイテムは終端を省くと auto（コンテナ端）扱いになるため span を明示する
        inlay.style.gridColumn = `${columnOf(fret)} / span 1`;
        inlay.style.gridRow = `${rowStart} / ${rowEnd}`;
        root.appendChild(inlay);
      }
    }

    for (let stringNo = 1; stringNo <= stringCount; stringNo++) {
      const label = document.createElement('div');
      label.className = 'string-label';
      label.textContent = `${stringNo}弦`;
      labels.set(stringNo, label);

      const rowCells = orderedFrets.map((fret) => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = ['cell', `s${stringNo}`, fret === 0 ? 'is-open' : '']
          .filter(Boolean)
          .join(' ');
        cell.dataset.string = String(stringNo);
        cell.dataset.fret = String(fret);
        cell.setAttribute('aria-label', `${stringNo}弦 ${fret}フレット`);
        cells.set(`${stringNo}-${fret}`, cell);
        return cell;
      });

      root.append(...(lefty ? [...rowCells, label] : [label, ...rowCells]));
    }

    const numberSpacer = document.createElement('div');
    numberSpacer.className = 'fret-number-spacer';
    if (!lefty) root.appendChild(numberSpacer);

    // 列が多いと番号が重なって読めなくなるため、目印になるフレットだけを残す
    const showEveryNumber = frets.length <= 12;
    const isLandmark = (fret) =>
      fret === frets[0] ||
      fret === frets[frets.length - 1] ||
      SINGLE_INLAY_FRETS.includes(fret) ||
      DOUBLE_INLAY_FRETS.includes(fret);

    for (const fret of orderedFrets) {
      const number = document.createElement('div');
      number.className = 'fret-number';
      number.textContent = showEveryNumber || isLandmark(fret) ? String(fret) : '';
      root.appendChild(number);
    }
    if (lefty) root.appendChild(numberSpacer);

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
    /** セルに印を付け、音名ラベルを出す。type は correct / wrong / root */
    markCell(stringNo, fret, type, noteName) {
      const cell = cells.get(`${stringNo}-${fret}`);
      if (!cell) return;
      cell.classList.add(`is-${type}`);
      cell.textContent = noteName;
    },

    /** 全セルを未回答状態へ戻す */
    reset() {
      for (const cell of cells.values()) {
        cell.classList.remove('is-correct', 'is-wrong', 'is-root');
        cell.textContent = '';
      }
    },

    /** 弦の本数・フレット範囲・利き手を設定する。変化があったときだけ組み直す */
    setLayout(nextStringCount, nextMin, nextMax, nextLefty) {
      if (
        nextStringCount === stringCount &&
        nextMin === fretMin &&
        nextMax === fretMax &&
        nextLefty === lefty
      ) {
        return;
      }
      stringCount = nextStringCount;
      fretMin = nextMin;
      fretMax = nextMax;
      lefty = nextLefty;
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
