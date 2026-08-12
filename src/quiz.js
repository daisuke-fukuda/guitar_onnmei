/**
 * セッション / 問題の生成・判定・スコア集計。
 * DOM に依存しない。状態はプレーンオブジェクトとして保持し、後で永続化できるようにする。
 */

import {
  ALL_STRINGS,
  DEFAULT_INTERVAL_IDS,
  DEFAULT_INTERVAL_NAMING,
  DEFAULT_STRING_COUNT,
  NO_TUNING_OFFSETS,
  DEFAULT_FRET_MAX,
  DEFAULT_FRET_MIN,
  FLAT_NOTES,
  NATURAL_NOTES,
  SHARP_NOTES,
  findInterval,
  findPositions,
  isFlatName,
  noteNameAt,
  transposeName,
} from './music.js';

export const MODES = {
  NORMAL: 'normal',
  TIME_ATTACK: 'timeattack',
};

/** 出題形式。音名そのものを探すか、ルートからの度数で探すか */
export const QUIZ_TYPES = {
  NOTE: 'note',
  INTERVAL: 'interval',
};

/** 通常モードの出題数 */
export const QUESTIONS_PER_SESSION = 10;

/** タイムアタックの持ち時間 */
export const TIME_ATTACK_DURATION_MS = 60_000;

/** タイムアタックで 1 回誤答するごとに減る時間 */
export const MISS_PENALTY_MS = 3_000;

export const DEFAULT_SETTINGS = {
  mode: MODES.NORMAL,
  quizType: QUIZ_TYPES.NOTE,
  intervals: [...DEFAULT_INTERVAL_IDS],
  intervalNaming: DEFAULT_INTERVAL_NAMING,
  stringCount: DEFAULT_STRING_COUNT,
  tuning: [...NO_TUNING_OFFSETS],
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
 * 設定で有効になっている音名。
 * ♯ と ♭ は異名同音だが、呼び名を両方覚えられるよう別の音として扱う。
 */
function enabledNoteNames(settings) {
  const names = [...NATURAL_NOTES];
  if (settings.includeSharps) names.push(...SHARP_NOTES);
  if (settings.includeFlats) names.push(...FLAT_NOTES);
  return names;
}

/**
 * 音名モードの出題対象。
 * 対象範囲に 1 箇所も存在しない音名は出題できないため除外する。
 */
export function buildNotePool(settings) {
  return enabledNoteNames(settings).filter(
    (noteName) => findPositions(noteName, settings).length > 0,
  );
}

/**
 * 相対音モードの出題対象。ルート・度数・方向の組み合わせを作る。
 * ルート自体は指板になくてもよい（頭の中の基準音）が、
 * **答えの音が対象範囲に無い組み合わせは出題できない**ので除く。
 */
export function buildIntervalPool(settings) {
  const specs = [];
  for (const root of enabledNoteNames(settings)) {
    // 答えの表記はルートに合わせる。1 問の中で ♯ と ♭ が混ざらないようにするため
    const useFlats = isFlatName(root);
    for (const intervalId of settings.intervals) {
      const interval = findInterval(intervalId);
      if (!interval) continue;

      // テンションは「♭9th 下」のような言い方をしないため上行だけ出す
      const directions = interval.upOnly ? ['up'] : ['up', 'down'];
      for (const direction of directions) {
        const semitones = direction === 'up' ? interval.semitones : -interval.semitones;
        const answer = transposeName(root, semitones, useFlats);
        if (findPositions(answer, settings).length === 0) continue;
        specs.push({ root, intervalId, direction, answer, useFlats });
      }
    }
  }
  return specs;
}

function buildPool(settings) {
  return settings.quizType === QUIZ_TYPES.INTERVAL
    ? buildIntervalPool(settings)
    : buildNotePool(settings);
}

/**
 * プールから出題数ぶんの音名を選ぶ。
 * プールが出題数に満たない場合は、1 巡してから再度シャッフルして繰り返す
 * （同じ音が 2 回出るが、1 巡目で全ての音を必ず 1 回は出せる）。
 */
function pickItems(pool, count) {
  const picked = [];
  while (picked.length < count) {
    picked.push(...shuffle(pool).slice(0, count - picked.length));
  }
  return picked;
}

/**
 * プールの 1 要素から問題を作る。
 * 音名モードは文字列、相対音モードは組み合わせオブジェクトが渡る。
 */
function createQuestion(item, settings) {
  const isSpec = typeof item === 'object';
  const noteName = isSpec ? item.answer : item;
  const positions = findPositions(noteName, settings);

  return {
    noteName,
    // 相対音モードでは出題文の材料。音名モードでは null
    prompt: isSpec ? item : null,
    useFlats: isSpec ? item.useFlats : isFlatName(noteName),
    positions,
    targetKeys: new Set(positions.map((p) => positionKey(p.string, p.fret))),
    found: new Set(),
    missed: new Set(),
  };
}

/** タイムアタックでは何問解けるか事前に決まらないため、1 問ずつ足していく */
function appendQuestion(session) {
  if (session.queue.length === 0) session.queue = shuffle(session.pool);
  session.questions.push(createQuestion(session.queue.pop(), session.settings));
  session.index = session.questions.length - 1;
}

export function createSession(settings = DEFAULT_SETTINGS) {
  const pool = buildPool(settings);
  if (pool.length === 0) throw new Error('出題できる問題がありません');

  const timeAttack = settings.mode === MODES.TIME_ATTACK;
  const session = {
    settings,
    mode: settings.mode,
    pool,
    queue: [],
    questions: [],
    index: 0,
    score: { correctTaps: 0, wrongTaps: 0 },
    startedAt: Date.now(),
    finishedAt: null,
    penaltyMs: 0,
    durationMs: timeAttack ? TIME_ATTACK_DURATION_MS : null,
  };

  if (timeAttack) {
    appendQuestion(session);
  } else {
    for (const item of pickItems(pool, QUESTIONS_PER_SESSION)) {
      session.questions.push(createQuestion(item, settings));
    }
  }
  return session;
}

/** 制限時間の残り（ミリ秒）。通常モードでは null */
export function remainingMs(session) {
  if (session.durationMs === null) return null;
  const spent = (session.finishedAt ?? Date.now()) - session.startedAt;
  return Math.max(0, session.durationMs - spent - session.penaltyMs);
}

export function isTimeUp(session) {
  return session.durationMs !== null && remainingMs(session) === 0;
}

/** 全ポジションを見つけ終えた問題の数 */
export function clearedCount(session) {
  return session.questions.filter((q) => q.found.size === q.positions.length).length;
}

/** 計測を止める。最終問題をクリアした時点で呼ぶ */
export function finishSession(session) {
  if (session.finishedAt === null) session.finishedAt = Date.now();
}

/** スタートからの経過時間（ミリ秒）。終了後は最終問題クリア時点で固定される */
export function elapsedMs(session) {
  return (session.finishedAt ?? Date.now()) - session.startedAt;
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
  if (session.mode === MODES.TIME_ATTACK) {
    appendQuestion(session);
  } else {
    session.index += 1;
  }
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
    // タイムアタックでは、あて推量で押すのを抑えるため持ち時間を削る
    if (session.mode === MODES.TIME_ATTACK) session.penaltyMs += MISS_PENALTY_MS;
  }

  return {
    type: correct ? 'correct' : 'wrong',
    // 誤答セルの音名は、出題中の問題と同じ表記系（♯ / ♭）で見せる
    noteName: noteNameAt(stringNo, fret, {
      useFlats: question.useFlats,
      tuning: session.settings.tuning,
    }),
    remaining: remainingCount(session),
    cleared: isCleared(session),
  };
}

export function summary(session) {
  const { correctTaps, wrongTaps } = session.score;
  const total = correctTaps + wrongTaps;
  return {
    mode: session.mode,
    questionCount: session.questions.length,
    clearedCount: clearedCount(session),
    correctTaps,
    wrongTaps,
    accuracy: total === 0 ? 0 : (correctTaps / total) * 100,
    elapsedMs: elapsedMs(session),
    penaltyMs: session.penaltyMs,
    durationMs: session.durationMs,
  };
}
