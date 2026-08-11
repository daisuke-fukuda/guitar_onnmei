/**
 * エントリポイント。画面状態の管理と DOM の配線のみを行う。
 */

import { FRET_MAX, FRET_MIN } from './music.js';
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
  resultQuestions: document.getElementById('result-questions'),
  resultCorrect: document.getElementById('result-correct'),
  resultWrong: document.getElementById('result-wrong'),
  resultAccuracy: document.getElementById('result-accuracy'),
  primaryButton: document.getElementById('primary-button'),
  srStatus: document.getElementById('sr-status'),
};

const board = createFretboard(document.getElementById('fretboard'), handleCellClick);

let session = null;
let state = STATE.IDLE;

function setState(next) {
  state = next;
  render();
}

function startSession() {
  session = Quiz.createSession();
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
  if (state === STATE.IDLE || state === STATE.RESULT) {
    startSession();
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

function renderResult() {
  const stats = Quiz.summary(session);
  el.resultQuestions.textContent = `${stats.questionCount} 問`;
  el.resultCorrect.textContent = `${stats.correctTaps} 回`;
  el.resultWrong.textContent = `${stats.wrongTaps} 回`;
  el.resultAccuracy.textContent = `${stats.accuracy.toFixed(1)} %`;
}

function render() {
  el.app.dataset.state = state;

  if (state === STATE.IDLE) {
    el.progress.textContent = `0 / ${Quiz.QUESTIONS_PER_SESSION} 問`;
    el.miss.textContent = 'ミス 0';
    el.questionNote.textContent = '';
    el.promptLead.textContent = 'スタートを押すと出題が始まります';
    el.remaining.textContent = `指板 ${FRET_MIN}〜${FRET_MAX} フレットから、指定された音をすべて探します`;
    el.primaryButton.textContent = 'スタート';
    el.primaryButton.disabled = false;
    board.setInteractive(false);
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
render();
