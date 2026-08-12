/**
 * エントリポイント。画面状態の管理と DOM の配線のみを行う。
 */

import { ALL_STRINGS, FRET_MAX, FRET_MIN, pitchClassOf } from './music.js';
import { createFretboard } from './fretboard.js';
import * as Quiz from './quiz.js';

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
  questionNote: document.getElementById('question-note'),
  promptLead: document.getElementById('prompt-lead'),
  remaining: document.getElementById('remaining'),
  settings: document.getElementById('settings'),
  optSharps: document.getElementById('opt-sharps'),
  optFlats: document.getElementById('opt-flats'),
  optStrings: document.getElementById('opt-strings'),
  settingsSummary: document.getElementById('settings-summary'),
  resultQuestions: document.getElementById('result-questions'),
  resultCorrect: document.getElementById('result-correct'),
  resultWrong: document.getElementById('result-wrong'),
  resultAccuracy: document.getElementById('result-accuracy'),
  primaryButton: document.getElementById('primary-button'),
  secondaryButton: document.getElementById('secondary-button'),
  shareX: document.getElementById('share-x'),
  shareLine: document.getElementById('share-line'),
  shareFacebook: document.getElementById('share-facebook'),
  shareCopy: document.getElementById('share-copy'),
  shareMore: document.getElementById('share-more'),
  shareNote: document.getElementById('share-note'),
  srStatus: document.getElementById('sr-status'),
};

const board = createFretboard(document.getElementById('fretboard'), handleCellClick);

let session = null;
let state = STATE.IDLE;

/** 設定 UI の現在値を読み取る */
function readSettings() {
  const strings = [...el.optStrings.querySelectorAll('input[type="checkbox"]')]
    .filter((input) => input.checked)
    .map((input) => Number(input.value));

  return {
    includeSharps: el.optSharps.checked,
    includeFlats: el.optFlats.checked,
    strings,
  };
}

function setState(next) {
  state = next;
  render();
}

function startSession(settings) {
  session = Quiz.createSession(settings);
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

  board.markCell(stringNo, fret, result.type, result.noteName);
  el.srStatus.textContent =
    result.type === 'correct'
      ? `正解。${stringNo}弦 ${fret}フレット。残り ${result.remaining} 箇所`
      : `不正解。${stringNo}弦 ${fret}フレットは ${result.noteName}`;

  setState(result.cleared ? STATE.CLEARED : STATE.ANSWERING);
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

  // 設定中も指板に対象弦を反映し、どこが出題範囲かを見せる
  board.setActiveStrings(settings.strings);

  if (settings.strings.length === 0) {
    el.settingsSummary.textContent = '対象の弦を 1 つ以上選んでください';
    el.settingsSummary.classList.add('is-warning');
    el.primaryButton.disabled = true;
    return;
  }

  const pool = Quiz.buildNotePool(settings);
  const sorted = [...pool].sort((a, b) => pitchClassOf(a) - pitchClassOf(b));
  el.settingsSummary.textContent =
    `出題する音 ${pool.length} 種（${sorted.join('  ')}）／全 ${Quiz.QUESTIONS_PER_SESSION} 問`;
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
  return [
    'ギター指板 音名クイズ',
    `${stats.questionCount}問 正答率 ${stats.accuracy.toFixed(1)}%（正解 ${stats.correctTaps} / ミス ${stats.wrongTaps}）`,
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
  // Facebook は本文を受け取らず、リンク先の OGP を読んでカードを作る
  el.shareFacebook.href = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

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
  el.resultQuestions.textContent = `${stats.questionCount} 問`;
  el.resultCorrect.textContent = `${stats.correctTaps} 回`;
  el.resultWrong.textContent = `${stats.wrongTaps} 回`;
  el.resultAccuracy.textContent = `${stats.accuracy.toFixed(1)} %`;
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
    el.remaining.textContent = `指板 ${FRET_MIN}〜${FRET_MAX} フレットから、指定された音をすべて探します`;
    el.primaryButton.textContent = 'スタート';
    board.setInteractive(false);
    renderSettings();
    return;
  }

  el.progress.textContent = `${session.index + 1} / ${Quiz.QUESTIONS_PER_SESSION} 問`;
  el.miss.textContent = `ミス ${session.score.wrongTaps}`;

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
  el.primaryButton.textContent = Quiz.isLastQuestion(session) ? '結果を見る' : '次の問題へ';
  el.primaryButton.disabled = false;
  board.setInteractive(false);
}

el.primaryButton.addEventListener('click', handlePrimaryClick);
el.secondaryButton.addEventListener('click', handleSecondaryClick);
el.shareCopy.addEventListener('click', handleCopyClick);
el.shareMore.addEventListener('click', handleMoreClick);
el.settings.addEventListener('change', () => {
  if (state === STATE.IDLE) renderSettings();
});

render();
