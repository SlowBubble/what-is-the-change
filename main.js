// ─── URL Params ───────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const MAX_ROUNDS = parseInt(params.get('rounds') ?? '10', 10);
const LEVEL = parseInt(params.get('level') ?? '3', 10);
const MAX_PENNIES = parseInt(params.get('max') ?? '20', 10); // Level 3: configurable max

// ─── Canvas setup ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Canvas dimensions are computed after layout constants are known (see bottom of layout section)
let W, H;

// ─── Colours (light mode) ─────────────────────────────────────────────────────
const CLR = {
  bg: '#ffffff',
  header: '#4a90d9',
  headerText: '#ffffff',
  colBorder: '#a0c4f1',
  penny: '#b87333',
  pennyHighlight: '#f5a623',
  pennyStroke: '#7a4a1e',
  pennyHighStroke: '#c07000',
  text: '#1a1a2e',
  textDim: '#5a6a8a',
  green: '#1a7a4a',
  red: '#c0392b',
  equationHighlight: '#e8541a',
  yellow: '#c07000',
  answerBox: '#e8f0fe',
  answerBoxActive: '#cce0ff',
  msgBg: 'rgba(232,240,254,0.97)',
};

// ─── Speech ───────────────────────────────────────────────────────────────────
function speak(text, onEnd, rate = 1) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = rate;

  let keepAlive;
  const startKeepAlive = () => {
    keepAlive = setInterval(() => {
      if (!window.speechSynthesis.speaking) { clearInterval(keepAlive); return; }
      window.speechSynthesis.resume();
    }, 250);
  };

  utt.onstart = startKeepAlive;
  utt.onend = () => {
    clearInterval(keepAlive);
    if (onEnd) onEnd();
  };
  utt.onerror = (e) => {
    clearInterval(keepAlive);
    if (e.error !== 'canceled' && onEnd) onEnd();
  };

  window.speechSynthesis.speak(utt);
}

// ─── Layout ───────────────────────────────────────────────────────────────────
// How many sub-columns does a value column need?
// Each sub-column holds up to 10 pennies stacked vertically.
const PENNIES_PER_SUBCOL = 10;
const SUB_COL_W = 56;      // width of one sub-column (holds one penny stack)
const SUB_COL_GAP = 6;     // gap between sub-columns inside a value column

// PENNY_R and ROW_H are derived below after the viewport height is known

// How many sub-columns do the Today/Yesterday columns need?
const MAX_SUBCOLS = Math.ceil(MAX_PENNIES / PENNIES_PER_SUBCOL); // e.g. 2 for max=20

// Width of a value column (Today / Yesterday)
const VALUE_COL_W = MAX_SUBCOLS * SUB_COL_W + (MAX_SUBCOLS - 1) * SUB_COL_GAP;

// Answer column is just wide enough for a 2-digit number
const ANSWER_COL_W = 120;

const COL_GAP = 40;        // gap between the three main columns
const MARGIN = 40;         // left/right margin

// Total canvas width
W = MARGIN * 2 + VALUE_COL_W * 2 + ANSWER_COL_W + COL_GAP * 2;

const HEADER_H = 50;
const TITLE_H = 50;        // space above the columns for the title
const COL_Y = TITLE_H;     // top of columns

// Vertical metrics inside a column
const NUM_Y = COL_Y + HEADER_H + 20;           // y of the big number
const PENNIES_START_Y = NUM_Y + 36;            // y of the first penny

// How tall do the columns need to be?
const MAX_ROWS = PENNIES_PER_SUBCOL; // tallest sub-column is 10 pennies

// Set canvas height = viewport height. Divide what's left after the header
// area equally across the 10 penny rows.
const TARGET_H   = window.innerHeight > 0 ? window.innerHeight : 800;
H                = TARGET_H;
const ROW_H      = Math.max(Math.floor((H - PENNIES_START_Y - 10) / MAX_ROWS), 20);
// Penny fills ~35% of the row height each side, leaving ~30% as gap
const PENNY_R    = Math.max(Math.floor(ROW_H * 0.35), 4);

canvas.width = W;
canvas.height = H;

// X-origin of each of the three main columns (left edge)
function mainColX(i) {
  if (i === 0) return MARGIN;
  if (i === 1) return MARGIN + VALUE_COL_W + COL_GAP;
  return MARGIN + VALUE_COL_W * 2 + COL_GAP * 2;
}
// Center x of a main column
function mainColCX(i) {
  const w = i < 2 ? VALUE_COL_W : ANSWER_COL_W;
  return mainColX(i) + w / 2;
}

// X-center of sub-column `s` within value column `i` (0-based)
function subColCX(i, s) {
  return mainColX(i) + s * (SUB_COL_W + SUB_COL_GAP) + SUB_COL_W / 2;
}

// ─── State machine ────────────────────────────────────────────────────────────
// States: 'intro' | 'question' | 'wrong_too_high' | 'wrong_too_low' | 'counting' | 'correct' | 'done'
let state = 'intro';

let today = 0;
let yesterday = 0;
let change = 0;
let typedAnswer = '';       // digits typed so far (may be multi-digit)
let round = 0;
let score = 0;

// Counting animation
let countStep = 0;
let countTimer = null;
let countHighlights = [];   // indices into today's pennies that are "extra"

// Level 2 equation reveal
let showEquation = false;

// ─── Input ────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', onKey);

function onKey(e) {
  if (e.code === 'Space') e.preventDefault();

  if (state === 'intro' && e.code === 'Space') {
    startGame();
    return;
  }

  if (state === 'question') {
    if (e.key >= '0' && e.key <= '9') {
      handleDigit(parseInt(e.key, 10));
    }
    return;
  }

  if (state === 'wrong_too_high' || state === 'wrong_too_low') {
    if (e.key >= '0' && e.key <= '9') {
      typedAnswer = '';
      state = 'question';
      draw();
      handleDigit(parseInt(e.key, 10));
    }
    return;
  }

  if (state === 'correct') {
    if (e.code === 'Space' && !countTimer) {
      nextRound();
    }
    return;
  }

  if (state === 'done') {
    if (e.code === 'Space') {
      resetGame();
    }
    return;
  }
}

// ─── Game flow ────────────────────────────────────────────────────────────────
function startGame() {
  round = 0;
  score = 0;
  speak('Welcome to What is the Change!', () => newRound());
}

function resetGame() {
  state = 'intro';
  typedAnswer = '';
  showEquation = false;
  clearCountTimer();
  draw();
}

function newRound() {
  typedAnswer = '';
  clearCountTimer();
  countStep = 0;
  showEquation = false;

  // Pick two different numbers 0–MAX_PENNIES; bigger = today
  let a = randInt(0, MAX_PENNIES);
  let b = randInt(0, MAX_PENNIES);
  while (b === a) b = randInt(0, MAX_PENNIES);
  today = Math.max(a, b);
  yesterday = Math.min(a, b);
  change = today - yesterday;

  // countHighlights: flat array of penny indices to highlight during counting,
  // in order. Each entry is a single index (one step = one penny).
  //
  // Normal case: the extra pennies are simply yesterday…today-1.
  //   e.g. 8-2 → [2,3,4,5,6,7]
  //
  // Smart line case (yesterday single-digit, today double-digit, mirrored
  // position fits inside today): the dash moves to sub-col 1 at the same row
  // as yesterday's boundary. The "extra" zone is redefined as:
  //   • all of sub-col 0: indices 0…PENNIES_PER_SUBCOL-1
  //   • sub-col 1 pennies BELOW the smart line: indices mirroredIdx+1…today-1
  // Pennies in sub-col 1 AT or ABOVE the smart line (indices
  // PENNIES_PER_SUBCOL…mirroredIdx) are shared context — never highlighted.
  //   e.g. 14-2 → [0,1,2,3,4,5,6,7,8,9, 12,13]
  //   e.g. 11-1 → [0,1,2,3,4,5,6,7,8,9]
  const _mirroredIdx = PENNIES_PER_SUBCOL + yesterday - 1;
  const _smartLine   = yesterday >= 1
    && yesterday < PENNIES_PER_SUBCOL
    && today    >= PENNIES_PER_SUBCOL
    && _mirroredIdx < today;

  countHighlights = [];
  if (_smartLine) {
    // All of sub-col 0
    for (let i = 0; i < PENNIES_PER_SUBCOL; i++) countHighlights.push(i);
    // Sub-col 1 below the smart line
    for (let i = _mirroredIdx + 1; i < today; i++) countHighlights.push(i);
  } else {
    for (let i = yesterday; i < today; i++) countHighlights.push(i);
  }

  state = 'question';
  const q = `I had ${yesterday} cents yesterday and ${today} cents today. How much more money do I have today than yesterday?`;
  draw();
  speak(q);
}

function nextRound() {
  round++;
  if (round >= MAX_ROUNDS) {
    state = 'done';
    speak(`Game over! You got ${score} out of ${MAX_ROUNDS} correct.`);
    draw();
  } else {
    newRound();
  }
}

// Level 3: accumulate digits; auto-submit once we have enough
function handleDigit(digit) {
  const expectedDigits = String(change).length;
  typedAnswer += String(digit);
  draw(); // show the partial answer

  if (typedAnswer.length < expectedDigits) {
    // Still waiting for more digits — nothing to evaluate yet
    return;
  }

  // We have all the digits — evaluate
  const answer = parseInt(typedAnswer, 10);
  handleAnswer(answer);
}

function handleAnswer(answer) {
  draw(); // show the complete answer

  if (answer === change) {
    score++;
    state = 'correct';
    draw();
    speak('Yes! Let me count the extra pennies.', () => startCounting());
  } else if (answer > change) {
    state = 'wrong_too_high';
    const msg = `${answer} is too big! Try again.`;
    draw();
    speak(msg, () => { typedAnswer = ''; state = 'question'; draw(); });
  } else {
    state = 'wrong_too_low';
    const msg = `${answer} is too small! Try again.`;
    draw();
    speak(msg, () => { typedAnswer = ''; state = 'question'; draw(); });
  }
}

// ─── Counting animation ───────────────────────────────────────────────────────
function startCounting() {
  countStep = 0;
  stepCount();
}

function stepCount() {
  if (countStep < countHighlights.length) {
    countStep++;
    draw();
    speak(String(countStep), () => stepCount());
  } else {
    draw();
    const finalMsg = `I have ${change} more cent${change !== 1 ? 's' : ''} today than yesterday.`;
    if (LEVEL >= 2) {
      speak(finalMsg, () => {
        showEquation = true;
        draw();
        setTimeout(() => {
          speak(`Fun fact: ${today} minus ${yesterday} equals ${change}.`, () => {
            showEquation = false;
            draw();
          }, 0.7);
        }, 500);
      });
    } else {
      speak(finalMsg);
    }
  }
}

function clearCountTimer() {
  if (countTimer) {
    clearTimeout(countTimer);
    countTimer = null;
  }
}

// ─── Drawing ──────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBg();

  if (state === 'intro') { drawIntro(); return; }
  if (state === 'done')  { drawDone();  return; }

  drawTitle();
  drawColumns();
}

function drawBg() {
  ctx.fillStyle = CLR.bg;
  ctx.fillRect(0, 0, W, H);
}

function drawIntro() {
  ctx.fillStyle = CLR.green;
  ctx.font = 'bold 52px Segoe UI';
  ctx.textAlign = 'center';
  ctx.fillText('What is the Change?', W / 2, H / 2 - 40);

  ctx.fillStyle = CLR.textDim;
  ctx.font = '22px Segoe UI';
  ctx.fillText('press SPACE to start', W / 2, H / 2 + 20);
}

function drawDone() {
  ctx.fillStyle = CLR.yellow;
  ctx.font = 'bold 48px Segoe UI';
  ctx.textAlign = 'center';
  ctx.fillText('Game Over!', W / 2, H / 2 - 40);

  ctx.fillStyle = CLR.text;
  ctx.font = '30px Segoe UI';
  ctx.fillText(`Score: ${score} / ${MAX_ROUNDS}`, W / 2, H / 2 + 20);

  ctx.fillStyle = CLR.textDim;
  ctx.font = '16px Segoe UI';
  ctx.fillText('press SPACE to play again', W / 2, H / 2 + 70);
}

function drawTitle() {
  ctx.fillStyle = CLR.green;
  ctx.font = 'bold 34px Segoe UI';
  ctx.textAlign = 'center';
  ctx.fillText('What is the Change?', W / 2, 46);

  if (state !== 'intro' && state !== 'done') {
    ctx.fillStyle = CLR.textDim;
    ctx.font = '18px Segoe UI';
    ctx.textAlign = 'right';
    ctx.fillText(`Round ${round + 1} / ${MAX_ROUNDS}   Score: ${score}`, W - 16, 30);
    ctx.textAlign = 'center';
  }
}

function drawColumns() {
  drawValueColumn(0, 'Today', today);
  drawValueColumn(1, 'Yesterday', yesterday);
  drawAnswerColumnUI(2, 'Change');

  if (LEVEL >= 2 && showEquation) {
    drawOperators();
  }
}

function drawOperators() {
  const gap0mid = (mainColX(1) + mainColX(0) + VALUE_COL_W) / 2;
  const gap1mid = (mainColX(2) + mainColX(1) + VALUE_COL_W) / 2;

  ctx.font = 'bold 64px Segoe UI';
  ctx.textAlign = 'center';
  ctx.fillStyle = CLR.equationHighlight;
  ctx.fillText('−', gap0mid, NUM_Y);
  ctx.fillText('=', gap1mid, NUM_Y);
}

// Returns true if penny index i should be highlighted at the current countStep.
function isPennyHighlighted(i) {
  const pos = countHighlights.indexOf(i);
  return pos !== -1 && pos < countStep;
}

// Draw Today or Yesterday column (with sub-columns for overflow)
function drawValueColumn(colIndex, label, value) {
  const cx = mainColCX(colIndex);

  // Header label
  ctx.fillStyle = CLR.text;
  ctx.font = 'bold 22px Segoe UI';
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, COL_Y + 32);

  // Big number
  const numHighlight = LEVEL >= 2 && showEquation;
  ctx.fillStyle = numHighlight ? CLR.equationHighlight : CLR.yellow;
  ctx.font = numHighlight ? 'bold 64px Segoe UI' : 'bold 36px Segoe UI';
  ctx.textAlign = 'center';
  ctx.fillText(String(value), cx, NUM_Y);

  // Draw pennies distributed across sub-columns
  // Sub-column 0 (leftmost) = pennies 0–9, sub-column 1 = pennies 10–19, etc.
  for (let i = 0; i < value; i++) {
    const subCol = Math.floor(i / PENNIES_PER_SUBCOL);
    const row    = i % PENNIES_PER_SUBCOL;
    const px = subColCX(colIndex, subCol);
    const py = PENNIES_START_Y + row * ROW_H;
    const highlighted = colIndex === 0
      && isPennyHighlighted(i);
    drawPenny(px, py, highlighted);
  }

  // ── Dash line ──────────────────────────────────────────────────────────────
  // The line marks the boundary between the shared pennies and the extra ones,
  // spanning only the sub-column where that boundary falls.
  //
  // Smart case (Today column only): when yesterday is single-digit and today is
  // double-digit, the extra pennies cross the sub-col boundary.  Rather than
  // drawing the line mid-sub-col-0 at the exact yesterday position, we mirror
  // it into sub-col 1 at the same row — i.e. at penny index
  // (PENNIES_PER_SUBCOL + yesterday - 1).  This makes the "what's different"
  // zone visually land in the second sub-column, which is where the child
  // should focus their counting.
  //
  // Examples:
  //   12 − 2:  normal line → after penny  1, row 1, sub-col 0
  //            smart  line → after penny 11, row 1, sub-col 1  ✓
  //   13 − 5:  normal line → after penny  4, row 4, sub-col 0
  //            smart  line → after penny 14, row 4, sub-col 1  ✓

  // Smart rule: yesterday in sub-col 0, today spills into sub-col 1,
  // AND the mirrored position (10 + yesterday - 1) is still within today.
  const mirroredIdx = PENNIES_PER_SUBCOL + yesterday - 1;
  const smartLine = yesterday >= 1
    && yesterday < PENNIES_PER_SUBCOL
    && today >= PENNIES_PER_SUBCOL
    && mirroredIdx < today;  // mirrored penny actually exists in today's column

  if (colIndex === 0) {
    if (yesterday > 0) {
      let boundaryIdx;
      if (smartLine) {
        // Place the line in sub-col 1 at the same row as yesterday's boundary
        boundaryIdx = mirroredIdx;
      } else {
        boundaryIdx = yesterday - 1;
      }
      const boundarySubCol = Math.floor(boundaryIdx / PENNIES_PER_SUBCOL);
      const boundaryRow    = boundaryIdx % PENNIES_PER_SUBCOL;
      const lineY = PENNIES_START_Y + boundaryRow * ROW_H + PENNY_R + 6;
      drawDashLine(colIndex, boundarySubCol, lineY);
    }
  } else {
    // Yesterday column: always draws at its own last penny — unchanged.
    if (value > 0) {
      const boundaryIdx    = value - 1;
      const boundarySubCol = Math.floor(boundaryIdx / PENNIES_PER_SUBCOL);
      const boundaryRow    = boundaryIdx % PENNIES_PER_SUBCOL;
      const lineY = PENNIES_START_Y + boundaryRow * ROW_H + PENNY_R + 6;
      drawDashLine(colIndex, boundarySubCol, lineY);
    }
  }
}

// Draw a dashed divider line in a single sub-column
function drawDashLine(colIndex, subColIndex, lineY) {
  const subLeft  = mainColX(colIndex) + subColIndex * (SUB_COL_W + SUB_COL_GAP);
  const subRight = subLeft + SUB_COL_W;

  ctx.save();
  ctx.strokeStyle = '#4a90d9';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(subLeft + 4, lineY);
  ctx.lineTo(subRight - 4, lineY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// Draw the answer / Change column
function drawAnswerColumnUI(colIndex, label) {
  const cx = mainColCX(colIndex);
  const boxY = NUM_Y - 30;

  // Header label
  ctx.fillStyle = CLR.text;
  ctx.font = 'bold 22px Segoe UI';
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, COL_Y + 32);

  const numHighlight = LEVEL >= 2 && showEquation;
  const showAnswer = typedAnswer !== '' && state !== 'wrong_too_high' && state !== 'wrong_too_low';

  if (state === 'wrong_too_high' || state === 'wrong_too_low') {
    ctx.fillStyle = CLR.red;
    ctx.font = 'bold 36px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(typedAnswer, cx, boxY + 42);
  } else if (showAnswer || state === 'correct') {
    ctx.fillStyle = numHighlight ? CLR.equationHighlight : (state === 'correct' ? CLR.green : CLR.yellow);
    ctx.font = numHighlight ? 'bold 64px Segoe UI' : 'bold 36px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(typedAnswer, cx, boxY + 42);
  } else if (state === 'question') {
    // Show a hint with underscores matching expected digit count
    const blanks = '_'.repeat(String(change).length);
    ctx.fillStyle = CLR.textDim;
    ctx.font = '28px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(blanks, cx, boxY + 42);
  }

  // "press SPACE" hint once counting finishes
  if (state === 'correct' && countStep >= countHighlights.length) {
    ctx.fillStyle = CLR.textDim;
    ctx.font = '16px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText('press SPACE', cx, boxY + 72);
  }
}

function drawPenny(cx, cy, highlighted) {
  ctx.beginPath();
  ctx.arc(cx, cy, PENNY_R, 0, Math.PI * 2);
  ctx.fillStyle = highlighted ? CLR.pennyHighlight : CLR.penny;
  ctx.fill();
  ctx.strokeStyle = highlighted ? CLR.pennyHighStroke : CLR.pennyStroke;
  ctx.lineWidth = highlighted ? 2.5 : 1.5;
  ctx.stroke();

  const fontSize = Math.round(PENNY_R * 1.0);
  ctx.fillStyle = highlighted ? '#7a4a00' : '#7a4a1e';
  ctx.font = `bold ${fontSize}px Segoe UI`;
  ctx.textAlign = 'center';
  ctx.fillText('¢', cx, cy + fontSize * 0.38);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
draw();
