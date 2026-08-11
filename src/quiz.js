/**
 * セッション / 問題の生成・判定・スコア集計。
 * DOM に依存しない。状態はプレーンオブジェクトとして保持し、後で永続化できるようにする。
 */

import { NATURAL_NOTES, findPositions, noteNameAt } from './music.js';

export const QUESTIONS_PER_SESSION = NATURAL_NOTES.length;

export function positionKey(stringNo, fret) {
  return `${stringNo}-${fret}`;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createQuestion(noteName) {
  const positions = findPositions(noteName);
  return {
    noteName,
    positions,
    targetKeys: new Set(positions.map((p) => positionKey(p.string, p.fret))),
    found: new Set(),
    missed: new Set(),
  };
}

/** ナチュラル7音をシャッフルし、各音を1回ずつ出題するセッションを作る */
export function createSession() {
  return {
    questions: shuffle(NATURAL_NOTES).map(createQuestion),
    index: 0,
    score: { correctTaps: 0, wrongTaps: 0 },
  };
}

export function currentQuestion(session) {
  return session.questions[session.index];
}

export function remainingCount(session) {
  const question = currentQuestion(session);
  return question.positions.length - question.found.size;
}

export function isCleared(session) {
  return remainingCount(session) === 0;
}

export function isLastQuestion(session) {
  return session.index === session.questions.length - 1;
}

export function goToNextQuestion(session) {
  session.index += 1;
}

/**
 * 1 タップ分の回答を処理する。
 * すでに判定済みのセルは 'ignored' を返し、スコアに影響させない（連打対策）。
 */
export function answer(session, stringNo, fret) {
  const question = currentQuestion(session);
  const key = positionKey(stringNo, fret);

  if (question.found.has(key) || question.missed.has(key)) {
    return { type: 'ignored' };
  }

  const correct = question.targetKeys.has(key);
  if (correct) {
    question.found.add(key);
    session.score.correctTaps += 1;
  } else {
    question.missed.add(key);
    session.score.wrongTaps += 1;
  }

  return {
    type: correct ? 'correct' : 'wrong',
    noteName: noteNameAt(stringNo, fret),
    remaining: remainingCount(session),
    cleared: isCleared(session),
  };
}

export function summary(session) {
  const { correctTaps, wrongTaps } = session.score;
  const total = correctTaps + wrongTaps;
  return {
    questionCount: session.questions.length,
    correctTaps,
    wrongTaps,
    accuracy: total === 0 ? 0 : (correctTaps / total) * 100,
  };
}
