/**
 * セッション / 問題の生成・判定・スコア集計。
 * DOM に依存しない。状態はプレーンオブジェクトとして保持し、後で永続化できるようにする。
 */

import {
  ALL_STRINGS,
  DEFAULT_FRET_MAX,
  DEFAULT_FRET_MIN,
  FLAT_NOTES,
  NATURAL_NOTES,
  SHARP_NOTES,
  findPositions,
  isFlatName,
  noteNameAt,
} from './music.js';

export const QUESTIONS_PER_SESSION = 10;

export const DEFAULT_SETTINGS = {
  includeSharps: false,
  includeFlats: false,
  strings: [...ALL_STRINGS],
  fretMin: DEFAULT_FRET_MIN,
  fretMax: DEFAULT_FRET_MAX,
};

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

/**
 * 出題対象の音名を組み立てる。
 * ♯ と ♭ は異名同音だが、呼び名を両方覚えられるよう別の問題として扱う。
 * 対象弦に 1 箇所も存在しない音名は出題できないため除外する。
 */
export function buildNotePool(settings) {
  const pool = [...NATURAL_NOTES];
  if (settings.includeSharps) pool.push(...SHARP_NOTES);
  if (settings.includeFlats) pool.push(...FLAT_NOTES);
  return pool.filter((noteName) => findPositions(noteName, settings).length > 0);
}

/**
 * プールから出題数ぶんの音名を選ぶ。
 * プールが出題数に満たない場合は、1 巡してから再度シャッフルして繰り返す
 * （同じ音が 2 回出るが、1 巡目で全ての音を必ず 1 回は出せる）。
 */
function pickNotes(pool, count) {
  const picked = [];
  while (picked.length < count) {
    picked.push(...shuffle(pool).slice(0, count - picked.length));
  }
  return picked;
}

function createQuestion(noteName, settings) {
  const positions = findPositions(noteName, settings);
  return {
    noteName,
    useFlats: isFlatName(noteName),
    positions,
    targetKeys: new Set(positions.map((p) => positionKey(p.string, p.fret))),
    found: new Set(),
    missed: new Set(),
  };
}

export function createSession(settings = DEFAULT_SETTINGS) {
  const pool = buildNotePool(settings);
  if (pool.length === 0) throw new Error('出題できる音名がありません');

  return {
    settings,
    questions: pickNotes(pool, QUESTIONS_PER_SESSION).map((noteName) =>
      createQuestion(noteName, settings),
    ),
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
    // 誤答セルの音名は、出題中の問題と同じ表記系（♯ / ♭）で見せる
    noteName: noteNameAt(stringNo, fret, question.useFlats),
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
