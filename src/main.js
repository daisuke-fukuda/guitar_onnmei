/**
 * エントリポイント。画面状態の管理と DOM の配線のみを行う。
 */

import {
  ALL_STRINGS,
  DEFAULT_FRET_MAX,
  DEFAULT_FRET_MIN,
  FRET_LIMIT,
  pitchClassOf,
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
  optSharps: document.getElementById('opt-sharps'),
  optFlats: document.getElementById('opt-flats'),
  optFretMin: document.getElementById('opt-fret-min'),
  optFretMax: document.getElementById('opt-fret-max'),
  optStrings: document.getElementById('opt-strings'),
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

/** 保存された設定を UI へ反映する */
function applySettingsToUI(settings) {
  const mode = el.optMode.querySelector(`input[value="${settings.mode}"]`);
  if (mode) mode.checked = true;
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
  const strings = [...el.optStrings.querySelectorAll('input[type="checkbox"]')]
    .filter((input) => input.checked)
    .map((input) => Number(input.value));

  return {
    mode: el.optMode.querySelector('input:checked').value,
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
  board.setFretRange(settings.fretMin, settings.fretMax);
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

  el.remaining.textContent =
    settings.mode === Quiz.MODES.TIME_ATTACK
      ? '1 分で何問クリアできるか挑戦します（誤答すると 3 秒減ります）'
      : '指定された音を、指板からすべて探します';

  // 設定中も指板に反映し、どこが出題範囲かをスタート前に見せる
  board.setFretRange(settings.fretMin, settings.fretMax);
  board.setActiveStrings(settings.strings);

  // 弦が 0 本の状態は復元しても出題できないため保存しない
  if (settings.strings.length > 0) saveSettings(settings);

  if (settings.strings.length === 0) {
    el.settingsSummary.textContent = '対象の弦を 1 つ以上選んでください';
    el.settingsSummary.classList.add('is-warning');
    el.primaryButton.disabled = true;
    return;
  }

  const pool = Quiz.buildNotePool(settings);
  const sorted = [...pool].sort((a, b) => pitchClassOf(a) - pitchClassOf(b));
  el.settingsSummary.textContent =
    `${settings.fretMin}〜${settings.fretMax}フレット／出題する音 ${pool.length} 種（${sorted.join('  ')}）／全 ${Quiz.QUESTIONS_PER_SESSION} 問`;
  el.settingsSummary.classList.remove('is-warning');
  el.primaryButton.disabled = false;
}

/** 出題設定を一行で説明する（シェア文に載せる） */
function describeSettings(settings) {
  const notes = ['ナチュラル'];
  if (settings.includeSharps) notes.push('♯');
  if (settings.includeFlats) notes.push('♭');

  const strings =
    settings.strings.length === ALL_STRINGS.length
      ? '全弦'
      : `${settings.strings.join('・')}弦`;

  return `${notes.join('+')} / ${strings}`;
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
  el.questionNote.textContent = question.noteName;

  if (state === STATE.ANSWERING) {
    el.promptLead.textContent = 'をすべて見つけてください';
    el.remaining.textContent = `残り ${Quiz.remainingCount(session)} 箇所`;
    el.primaryButton.textContent = '次の問題へ';
    el.primaryButton.disabled = true;
    board.setInteractive(true);
    return;
  }

  // STATE.CLEARED
  el.promptLead.textContent = 'をすべて見つけました';
  el.remaining.textContent = `クリア！　この問題のミス ${question.missed.size} 回`;
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
  if (state === STATE.IDLE) renderSettings();
});

initFretSelects();
applySettingsToUI(loadSettings());
render();
