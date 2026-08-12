/**
 * エントリポイント。画面状態の管理と DOM の配線のみを行う。
 */

import {
  DEFAULT_FRET_MAX,
  INTERVALS,
  findInterval,
  DEFAULT_FRET_MIN,
  FRET_LIMIT,
  NO_TUNING_OFFSETS,
  OPEN_STRING_MIDI,
  TUNING_OFFSET_LIMIT,
  TUNING_PRESETS,
  findTuningPreset,
  midiToLabel,
  openMidiOf,
  pitchClassOf,
  stringRange,
} from './music.js';
import { createFretboard } from './fretboard.js';
import * as Quiz from './quiz.js';
import { loadSettings, saveSettings } from './storage.js';

const STATE = {
  IDLE: 'idle',
  ANSWERING: 'answering',
  CLEARED: 'cleared',
  RESULT: 'result',
};

const el = {
  app: document.getElementById('app'),
  progress: document.getElementById('progress'),
  miss: document.getElementById('miss'),
  timer: document.getElementById('timer'),
  questionNote: document.getElementById('question-note'),
  promptLead: document.getElementById('prompt-lead'),
  remaining: document.getElementById('remaining'),
  settings: document.getElementById('settings'),
  optMode: document.getElementById('opt-mode'),
  optQuizType: document.getElementById('opt-quiz-type'),
  optIntervals: document.getElementById('opt-intervals'),
  intervalRow: document.getElementById('interval-row'),
  optStringCount: document.getElementById('opt-string-count'),
  optSharps: document.getElementById('opt-sharps'),
  optFlats: document.getElementById('opt-flats'),
  optFretMin: document.getElementById('opt-fret-min'),
  optFretMax: document.getElementById('opt-fret-max'),
  optStrings: document.getElementById('opt-strings'),
  optTuning: document.getElementById('opt-tuning'),
  optTuningPreset: document.getElementById('opt-tuning-preset'),
  tuningCurrent: document.getElementById('tuning-current'),
  settingsSummary: document.getElementById('settings-summary'),
  resultQuestions: document.getElementById('result-questions'),
  resultCountLabel: document.getElementById('result-count-label'),
  resultCorrect: document.getElementById('result-correct'),
  resultWrong: document.getElementById('result-wrong'),
  resultTime: document.getElementById('result-time'),
  resultTimeLabel: document.getElementById('result-time-label'),
  resultMain: document.getElementById('result-main'),
  primaryButton: document.getElementById('primary-button'),
  secondaryButton: document.getElementById('secondary-button'),
  shareX: document.getElementById('share-x'),
  shareLine: document.getElementById('share-line'),
  shareCopy: document.getElementById('share-copy'),
  shareMore: document.getElementById('share-more'),
  shareNote: document.getElementById('share-note'),
  srStatus: document.getElementById('sr-status'),
};

const board = createFretboard(document.getElementById('fretboard'), handleCellClick);

let session = null;
let state = STATE.IDLE;
let timerId = null;

/** 経過時間を m:ss で表す */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function renderTimer() {
  if (!session) {
    el.timer.textContent = '0:00';
    return;
  }
  // タイムアタックは残り時間、通常モードは経過時間
  const remaining = Quiz.remainingMs(session);
  el.timer.textContent = formatDuration(remaining === null ? Quiz.elapsedMs(session) : remaining);
}

/** 時計を進めつつ、タイムアタックの時間切れを拾う */
function tick() {
  if (session && state !== STATE.RESULT && Quiz.isTimeUp(session)) {
    Quiz.finishSession(session);
    setState(STATE.RESULT);
    return;
  }
  renderTimer();
}

/** 回答中だけ時計を進める。残り時間の取りこぼしを防ぐため 250ms 間隔で見る */
function setTimerRunning(running) {
  if (running && timerId === null) {
    timerId = setInterval(tick, 250);
  } else if (!running && timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

/** フレット範囲のプルダウンを 0〜FRET_LIMIT で作る */
function initFretSelects() {
  for (const [select, initial] of [
    [el.optFretMin, DEFAULT_FRET_MIN],
    [el.optFretMax, DEFAULT_FRET_MAX],
  ]) {
    for (let fret = 0; fret <= FRET_LIMIT; fret++) {
      const option = document.createElement('option');
      option.value = String(fret);
      option.textContent = String(fret);
      select.appendChild(option);
    }
    select.value = String(initial);
  }
}

/** 度数のチェックボックスを作る */
function initIntervalOptions() {
  for (const interval of INTERVALS) {
    const label = document.createElement('label');
    label.className = 'option';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = interval.id;

    label.append(input, document.createTextNode(` ${interval.label}`));
    el.optIntervals.appendChild(label);
  }
}

/** チューニングのプリセット一覧を作る。一致しないときのための「カスタム」も置く */
function initTuningPresets() {
  for (const preset of [...TUNING_PRESETS, { id: 'custom', label: 'カスタム' }]) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    el.optTuningPreset.appendChild(option);
  }
}

/** 弦ごとの音を選ぶプルダウンを、弦の本数ぶん作る */
function buildTuningControls(stringCount) {
  if (el.optTuning.childElementCount === stringCount) return;

  el.optTuning.textContent = '';
  for (const stringNo of stringRange(stringCount)) {
    const base = OPEN_STRING_MIDI[stringNo - 1];
    const field = document.createElement('label');
    field.className = 'tuning-field';

    const name = document.createElement('span');
    name.className = 'tuning-field-label';
    name.textContent = `${stringNo}弦`;

    const select = document.createElement('select');
    select.dataset.string = String(stringNo);
    select.setAttribute('aria-label', `${stringNo}弦の音`);
    for (let offset = TUNING_OFFSET_LIMIT; offset >= -TUNING_OFFSET_LIMIT; offset--) {
      const option = document.createElement('option');
      option.value = String(offset);
      option.textContent = midiToLabel(base + offset);
      select.appendChild(option);
    }

    field.append(name, select);
    el.optTuning.appendChild(field);
  }
}

/** チューニングのプルダウン群に値を流し込む */
function applyTuningToUI(tuning) {
  for (const select of el.optTuning.querySelectorAll('select')) {
    select.value = String(tuning[Number(select.dataset.string) - 1] ?? 0);
  }
}

/** 保存された設定を UI へ反映する */
function applySettingsToUI(settings) {
  const mode = el.optMode.querySelector(`input[value="${settings.mode}"]`);
  if (mode) mode.checked = true;
  const quizType = el.optQuizType.querySelector(`input[value="${settings.quizType}"]`);
  if (quizType) quizType.checked = true;
  for (const input of el.optIntervals.querySelectorAll('input')) {
    input.checked = settings.intervals.includes(input.value);
  }
  const stringCount = el.optStringCount.querySelector(`input[value="${settings.stringCount}"]`);
  if (stringCount) stringCount.checked = true;
  buildTuningControls(settings.stringCount);
  applyTuningToUI(settings.tuning);
  el.optSharps.checked = settings.includeSharps;
  el.optFlats.checked = settings.includeFlats;
  el.optFretMin.value = String(settings.fretMin);
  el.optFretMax.value = String(settings.fretMax);
  for (const input of el.optStrings.querySelectorAll('input[type="checkbox"]')) {
    input.checked = settings.strings.includes(Number(input.value));
  }
}

/**
 * 開始 > 終了 になった場合に、直前に触った側を優先してもう一方を寄せる。
 * 選べない組み合わせを残すより、その場で辻褄を合わせるほうが迷わない。
 */
function normalizeFretRange(changedSelect) {
  const min = Number(el.optFretMin.value);
  const max = Number(el.optFretMax.value);
  if (min <= max) return;

  if (changedSelect === el.optFretMin) {
    el.optFretMax.value = String(min);
  } else {
    el.optFretMin.value = String(max);
  }
}

/** 設定 UI の現在値を読み取る */
function readSettings() {
  const stringCountValue = Number(el.optStringCount.querySelector('input:checked').value);
  // 弦の本数を超える弦は選ばれていても無視する
  const strings = [...el.optStrings.querySelectorAll('input[type="checkbox"]')]
    .filter((input) => input.checked && Number(input.value) <= stringCountValue)
    .map((input) => Number(input.value));

  const stringCount = Number(el.optStringCount.querySelector('input:checked').value);

  const tuning = [...NO_TUNING_OFFSETS];
  for (const select of el.optTuning.querySelectorAll('select')) {
    tuning[Number(select.dataset.string) - 1] = Number(select.value);
  }

  const intervals = [...el.optIntervals.querySelectorAll('input:checked')].map(
    (input) => input.value,
  );

  return {
    mode: el.optMode.querySelector('input:checked').value,
    quizType: el.optQuizType.querySelector('input:checked').value,
    intervals,
    stringCount,
    tuning,
    includeSharps: el.optSharps.checked,
    includeFlats: el.optFlats.checked,
    strings,
    fretMin: Number(el.optFretMin.value),
    fretMax: Number(el.optFretMax.value),
  };
}

function setState(next) {
  state = next;
  render();
}

function startSession(settings) {
  session = Quiz.createSession(settings);
  board.setLayout(settings.stringCount, settings.fretMin, settings.fretMax);
  board.setActiveStrings(settings.strings);
  board.reset();
  setState(STATE.ANSWERING);
}

function startNextQuestion() {
  Quiz.goToNextQuestion(session);
  board.reset();
  setState(STATE.ANSWERING);
}

function handleCellClick(stringNo, fret) {
  if (state !== STATE.ANSWERING) return;

  const result = Quiz.answer(session, stringNo, fret);
  if (result.type === 'ignored') return;

  const timeAttack = session.mode === Quiz.MODES.TIME_ATTACK;
  if (result.cleared && !timeAttack && Quiz.isLastQuestion(session)) Quiz.finishSession(session);

  board.markCell(stringNo, fret, result.type, result.noteName);
  el.srStatus.textContent =
    result.type === 'correct'
      ? `正解。${stringNo}弦 ${fret}フレット。残り ${result.remaining} 箇所`
      : `不正解。${stringNo}弦 ${fret}フレットは ${result.noteName}`;

  setState(result.cleared ? STATE.CLEARED : STATE.ANSWERING);

  // タイムアタックはテンポが命なので、正解を見せる間だけ置いて自動で次へ送る
  if (result.cleared && timeAttack) {
    setTimeout(() => {
      if (state === STATE.CLEARED && !Quiz.isTimeUp(session)) startNextQuestion();
    }, 400);
  }
}

function handlePrimaryClick() {
  if (state === STATE.IDLE) {
    startSession(readSettings());
    return;
  }
  if (state === STATE.RESULT) {
    // 「もう一度」は直前と同じ設定で始める
    startSession(session.settings);
    return;
  }
  if (state === STATE.CLEARED) {
    if (Quiz.isLastQuestion(session)) {
      setState(STATE.RESULT);
    } else {
      startNextQuestion();
    }
  }
}

function handleSecondaryClick() {
  if (state === STATE.RESULT) setState(STATE.IDLE);
}

function renderSettings() {
  const settings = readSettings();
  const isInterval = settings.quizType === Quiz.QUIZ_TYPES.INTERVAL;

  // 度数の選択は相対音モードのときだけ意味を持つ
  el.intervalRow.hidden = !isInterval;

  el.remaining.textContent =
    settings.mode === Quiz.MODES.TIME_ATTACK
      ? '1 分で何問クリアできるか挑戦します（誤答すると 3 秒減ります）'
      : isInterval
        ? 'ルート音から指定した度数の音を、指板からすべて探します'
        : '指定された音を、指板からすべて探します';

  // 弦を増やしたぶんのチューニング欄を用意する。
  // 作り直すと各プルダウンが既定値に戻るため、読み取った値を必ず流し直す
  buildTuningControls(settings.stringCount);
  applyTuningToUI(settings.tuning);

  // 今のチューニングを畳んだ状態でも分かるようにする
  const preset = findTuningPreset(settings.tuning);
  el.optTuningPreset.value = preset ? preset.id : 'custom';
  el.tuningCurrent.textContent = preset
    ? preset.label
    : stringRange(settings.stringCount)
        .map((stringNo) => midiToLabel(openMidiOf(stringNo, settings.tuning)))
        .reverse()
        .join(' ');

  // 弦の本数に応じて、対象の弦の選択肢を出し入れする
  for (const option of el.optStrings.querySelectorAll('[data-string-option]')) {
    option.hidden = Number(option.dataset.stringOption) > settings.stringCount;
  }

  // 設定中も指板に反映し、どこが出題範囲かをスタート前に見せる
  board.setLayout(settings.stringCount, settings.fretMin, settings.fretMax);
  board.setActiveStrings(settings.strings);

  // 弦が 0 本の状態は復元しても出題できないため保存しない
  if (settings.strings.length > 0) saveSettings(settings);

  if (settings.strings.length === 0) {
    el.settingsSummary.textContent = '対象の弦を 1 つ以上選んでください';
    el.settingsSummary.classList.add('is-warning');
    el.primaryButton.disabled = true;
    return;
  }

  if (isInterval && settings.intervals.length === 0) {
    el.settingsSummary.textContent = '出題する度数を 1 つ以上選んでください';
    el.settingsSummary.classList.add('is-warning');
    el.primaryButton.disabled = true;
    return;
  }

  const range = `${settings.fretMin}〜${settings.fretMax}フレット`;
  if (isInterval) {
    const specs = Quiz.buildIntervalPool(settings);
    el.settingsSummary.textContent =
      `${range}／${settings.intervals.length} 種の度数 × 上下＝${specs.length} 通り／全 ${Quiz.QUESTIONS_PER_SESSION} 問`;
  } else {
    const pool = Quiz.buildNotePool(settings);
    const sorted = [...pool].sort((a, b) => pitchClassOf(a) - pitchClassOf(b));
    el.settingsSummary.textContent =
      `${range}／出題する音 ${pool.length} 種（${sorted.join('  ')}）／全 ${Quiz.QUESTIONS_PER_SESSION} 問`;
  }
  el.settingsSummary.classList.remove('is-warning');
  el.primaryButton.disabled = false;
}

/** 出題設定を一行で説明する（シェア文に載せる） */
function describeSettings(settings) {
  const notes = ['ナチュラル'];
  if (settings.includeSharps) notes.push('♯');
  if (settings.includeFlats) notes.push('♭');

  const strings =
    settings.strings.length === settings.stringCount
      ? `全弦（${settings.stringCount}弦）`
      : `${settings.strings.join('・')}弦`;

  const type = settings.quizType === Quiz.QUIZ_TYPES.INTERVAL ? '相対音' : '音名';
  return `${type} / ${notes.join('+')} / ${strings}`;
}

function buildShareText() {
  const stats = Quiz.summary(session);
  const timeAttack = stats.mode === Quiz.MODES.TIME_ATTACK;
  return [
    timeAttack ? 'ギター指板 音名クイズ タイムアタック' : 'ギター指板 音名クイズ',
    timeAttack
      ? `1分で ${stats.clearedCount} 問クリア（正解 ${stats.correctTaps} / ミス ${stats.wrongTaps}）`
      : `${stats.questionCount}問 正答率 ${stats.accuracy.toFixed(1)}%（正解 ${stats.correctTaps} / ミス ${stats.wrongTaps}）`,
    timeAttack
      ? `正答率 ${stats.accuracy.toFixed(1)}%`
      : `タイム ${formatDuration(stats.elapsedMs)}`,
    `出題: ${describeSettings(session.settings)}`,
  ].join('\n');
}

/** クエリやハッシュを落とした、共有に適したページ URL */
function shareUrl() {
  return `${location.origin}${location.pathname}`;
}

let shareNoteTimer = null;

function showShareNote(message) {
  el.shareNote.textContent = message;
  clearTimeout(shareNoteTimer);
  shareNoteTimer = setTimeout(() => {
    el.shareNote.textContent = '';
  }, 2500);
}

/** 各 SNS の共有 URL を組み立て、リンクに設定する */
function updateShareLinks() {
  const text = buildShareText();
  const url = shareUrl();
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(url);

  el.shareX.href = `https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
  el.shareLine.href = `https://social-plugins.line.me/lineit/share?url=${encodedUrl}&text=${encodedText}`;

  // OS の共有シートは対応環境でのみ出す
  el.shareMore.hidden = !navigator.share;
}

async function handleCopyClick() {
  try {
    await navigator.clipboard.writeText(`${buildShareText()}\n${shareUrl()}`);
    showShareNote('コピーしました');
  } catch {
    showShareNote('コピーできませんでした');
  }
}

async function handleMoreClick() {
  try {
    await navigator.share({
      title: 'ギター指板 音名クイズ',
      text: buildShareText(),
      url: shareUrl(),
    });
  } catch (error) {
    // ユーザーが共有シートを閉じただけの場合は何も出さない
    if (error.name !== 'AbortError') showShareNote('シェアできませんでした');
  }
}

/** 出題文の後半。相対音モードでは「の長3度上を」のように度数を挟む */
function promptSuffix(question, verb) {
  if (!question.prompt) return `をすべて見つけ${verb}`;
  const interval = findInterval(question.prompt.intervalId);
  const direction = question.prompt.direction === 'up' ? '上' : '下';
  return `の ${interval.label}${direction} をすべて見つけ${verb}`;
}

function renderResult() {
  const stats = Quiz.summary(session);
  const timeAttack = stats.mode === Quiz.MODES.TIME_ATTACK;

  el.resultCountLabel.textContent = timeAttack ? 'クリア数' : '出題数';
  el.resultQuestions.textContent = `${timeAttack ? stats.clearedCount : stats.questionCount} 問`;
  el.resultCorrect.textContent = `${stats.correctTaps} 回`;
  el.resultWrong.textContent = `${stats.wrongTaps} 回`;

  // タイムアタックは持ち時間が固定なので、代わりに誤答で失った時間を出す
  el.resultTimeLabel.textContent = timeAttack ? '時間ロス' : 'かかった時間';
  el.resultTime.textContent = timeAttack
    ? `-${formatDuration(stats.penaltyMs)}`
    : formatDuration(stats.elapsedMs);

  el.resultMain.textContent = `${stats.accuracy.toFixed(1)} %`;
  el.shareNote.textContent = '';
  updateShareLinks();
}

function render() {
  el.app.dataset.state = state;

  if (state === STATE.IDLE) {
    el.progress.textContent = `0 / ${Quiz.QUESTIONS_PER_SESSION} 問`;
    el.miss.textContent = 'ミス 0';
    el.questionNote.textContent = '';
    el.promptLead.textContent = '';
    el.primaryButton.textContent = 'スタート';
    setTimerRunning(false);
    el.timer.textContent = '0:00';
    board.setInteractive(false);
    renderSettings();
    return;
  }

  const timeAttack = session.mode === Quiz.MODES.TIME_ATTACK;
  el.app.dataset.mode = session.mode;

  // タイムアタックは総問題数が決まらないため、進捗はクリア数で見せる
  el.progress.textContent = timeAttack
    ? `${Quiz.clearedCount(session)} 問クリア`
    : `${session.index + 1} / ${Quiz.QUESTIONS_PER_SESSION} 問`;
  el.miss.textContent = `ミス ${session.score.wrongTaps}`;

  setTimerRunning(state !== STATE.RESULT);
  renderTimer();

  if (state === STATE.RESULT) {
    renderResult();
    el.primaryButton.textContent = 'もう一度';
    el.primaryButton.disabled = false;
    board.setInteractive(false);
    return;
  }

  const question = Quiz.currentQuestion(session);
  // 相対音モードで見せるのはルート音。答えの音名は伏せる
  el.questionNote.textContent = question.prompt ? question.prompt.root : question.noteName;

  if (state === STATE.ANSWERING) {
    el.promptLead.textContent = promptSuffix(question, 'てください');
    el.remaining.textContent = `残り ${Quiz.remainingCount(session)} 箇所`;
    el.primaryButton.textContent = '次の問題へ';
    el.primaryButton.disabled = true;
    board.setInteractive(true);
    return;
  }

  // STATE.CLEARED
  el.promptLead.textContent = promptSuffix(question, 'ました');
  // 相対音モードは答えの音名を伏せて出題しているので、ここで答え合わせをする
  el.remaining.textContent = question.prompt
    ? `クリア！　答えは ${question.noteName}（この問題のミス ${question.missed.size} 回）`
    : `クリア！　この問題のミス ${question.missed.size} 回`;
  // タイムアタックは自動で次へ送るため、ボタンを押させない
  el.primaryButton.textContent = timeAttack
    ? '次の問題へ'
    : Quiz.isLastQuestion(session)
      ? '結果を見る'
      : '次の問題へ';
  el.primaryButton.disabled = timeAttack;
  board.setInteractive(false);
}

el.primaryButton.addEventListener('click', handlePrimaryClick);
el.secondaryButton.addEventListener('click', handleSecondaryClick);
el.shareCopy.addEventListener('click', handleCopyClick);
el.shareMore.addEventListener('click', handleMoreClick);
el.settings.addEventListener('change', (event) => {
  if (event.target === el.optFretMin || event.target === el.optFretMax) {
    normalizeFretRange(event.target);
  }
  // プリセットを選んだら各弦へ流し込む（「カスタム」は表示専用なので何もしない）
  if (event.target === el.optTuningPreset) {
    const preset = TUNING_PRESETS.find((item) => item.id === el.optTuningPreset.value);
    if (preset) applyTuningToUI(preset.offsets);
  }
  // 弦の本数を変えたら対象の弦を選び直す。増やした弦を毎回手で足すのは煩わしく、
  // 減らしたときに範囲外の選択が残るのも避けたいため、その本数の全弦に揃える
  if (el.optStringCount.contains(event.target)) {
    const count = Number(el.optStringCount.querySelector('input:checked').value);
    for (const input of el.optStrings.querySelectorAll('input[type="checkbox"]')) {
      input.checked = Number(input.value) <= count;
    }
  }
  if (state === STATE.IDLE) renderSettings();
});

initFretSelects();
initTuningPresets();
initIntervalOptions();
applySettingsToUI(loadSettings());
render();
