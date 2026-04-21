(() => {
  const CELL_SIZE = 18;
  const GRID_LINE_COLOR = '#e8edf5';
  const MOVE_OUTLINE_COLOR = '#94a3b8';
  const MOVE_HOVER_OUTLINE_COLOR = '#38bdf8';
  const MOVE_SELECTED_OUTLINE_COLOR = '#facc15';
  const DEFAULTS = {
    width: 60,
    height: 40,
    maxRoll: 10,
    players: [
      { id: 0, name: 'Игрок 1', color: '#2F80ED', startCorner: 'tl' },
      { id: 1, name: 'Игрок 2', color: '#EB5757', startCorner: 'br' }
    ]
  };

  const ui = {
    setupScreen: document.getElementById('setupScreen'),
    gameScreen: document.getElementById('gameScreen'),
    fieldWidth: document.getElementById('fieldWidth'),
    fieldHeight: document.getElementById('fieldHeight'),
    maxRoll: document.getElementById('maxRoll'),
    player1Name: document.getElementById('player1Name'),
    player1Color: document.getElementById('player1Color'),
    player2Name: document.getElementById('player2Name'),
    player2Color: document.getElementById('player2Color'),
    startGameBtn: document.getElementById('startGameBtn'),
    currentPlayerName: document.getElementById('currentPlayerName'),
    rollText: document.getElementById('rollText'),
    orientationText: document.getElementById('orientationText'),
    adjacencyStatus: document.getElementById('adjacencyStatus'),
    gameBoard: document.getElementById('gameBoard'),
    rotateBtn: document.getElementById('rotateBtn'),
    confirmBtn: document.getElementById('confirmBtn'),
    clearSelectionBtn: document.getElementById('clearSelectionBtn'),
    newMatchBtn: document.getElementById('newMatchBtn'),
    backToSetupBtn: document.getElementById('backToSetupBtn'),
    endModal: document.getElementById('endModal'),
    endMessage: document.getElementById('endMessage'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    toSetupBtn: document.getElementById('toSetupBtn')
  };

  const state = {
    settings: structuredClone(DEFAULTS),
    board: null,
    currentPlayer: 0,
    turnRoll: { a: 1, b: 1 },
    orientationSwapped: false,
    rects: [],
    allowedMoves: [],
    fullAdjacencyRequired: false,
    hoverMoveKey: null,
    selectedMoveKey: null,
    gameOver: false,
    winnerId: null,
    endReason: ''
  };

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function rgb(hex) {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  }

  function rgba(hex, alpha) {
    const c = rgb(hex);
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
  }

  function moveKey(move) {
    return `${move.x}:${move.y}:${move.width}:${move.height}`;
  }

  function getCurrentDims() {
    const { a, b } = state.turnRoll;
    return state.orientationSwapped ? { width: b, height: a } : { width: a, height: b };
  }

  function generateRoll(maxRoll) {
    const rnd = () => 1 + Math.floor(Math.random() * maxRoll);
    return { a: rnd(), b: rnd() };
  }

  function createEmptyBoard(width, height) {
    return Array.from({ length: height }, () => Array(width).fill(-1));
  }

  function inBounds(x, y, width, height) {
    return x >= 0 && y >= 0 && x + width <= state.settings.width && y + height <= state.settings.height;
  }

  function areaFree(x, y, width, height) {
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) {
        if (state.board[row][col] !== -1) return false;
      }
    }
    return true;
  }

  function rectsOfPlayer(playerId) {
    return state.rects.filter((r) => r.playerId === playerId);
  }

  function isFirstMove(playerId) {
    return rectsOfPlayer(playerId).length === 0;
  }

  function touchesStartCornerAsCorner(x, y, width, height, playerId) {
    if (playerId === 0) return x === 0 && y === 0;
    const farX = state.settings.width - 1;
    const farY = state.settings.height - 1;
    return x + width - 1 === farX && y + height - 1 === farY;
  }

  // Проверка прилегания по стороне со своими прямоугольниками.
  // Возвращает факт бокового касания и наличие полного прилегания.
  function evaluateAdjacency(x, y, width, height, playerId) {
    let sideTouch = false;
    let hasFull = false;
    const own = rectsOfPlayer(playerId);

    for (const old of own) {
      // Новый справа от старого
      if (x === old.x + old.width) {
        const overlap = Math.min(y + height, old.y + old.height) - Math.max(y, old.y);
        if (overlap > 0) {
          sideTouch = true;
          if (overlap === height) hasFull = true;
        }
      }
      // Новый слева от старого
      if (x + width === old.x) {
        const overlap = Math.min(y + height, old.y + old.height) - Math.max(y, old.y);
        if (overlap > 0) {
          sideTouch = true;
          if (overlap === height) hasFull = true;
        }
      }
      // Новый ниже старого
      if (y === old.y + old.height) {
        const overlap = Math.min(x + width, old.x + old.width) - Math.max(x, old.x);
        if (overlap > 0) {
          sideTouch = true;
          if (overlap === width) hasFull = true;
        }
      }
      // Новый выше старого
      if (y + height === old.y) {
        const overlap = Math.min(x + width, old.x + old.width) - Math.max(x, old.x);
        if (overlap > 0) {
          sideTouch = true;
          if (overlap === width) hasFull = true;
        }
      }

      if (hasFull) break;
    }

    return { sideTouch, hasFull };
  }

  function enumerateMovesFor(playerId, width, height) {
    const moves = [];

    for (let y = 0; y <= state.settings.height - height; y++) {
      for (let x = 0; x <= state.settings.width - width; x++) {
        if (!inBounds(x, y, width, height)) continue;
        if (!areaFree(x, y, width, height)) continue;

        if (isFirstMove(playerId)) {
          if (touchesStartCornerAsCorner(x, y, width, height, playerId)) {
            moves.push({ x, y, width, height, full: true, partial: false });
          }
          continue;
        }

        const adjacency = evaluateAdjacency(x, y, width, height, playerId);
        if (!adjacency.sideTouch) continue;

        moves.push({
          x,
          y,
          width,
          height,
          full: adjacency.hasFull,
          partial: !adjacency.hasFull
        });
      }
    }

    const full = moves.filter((m) => m.full);
    if (full.length > 0) {
      return { moves: full, fullRequired: true };
    }
    return { moves, fullRequired: false };
  }

  function recalcMovesAndHandleDefeat() {
    if (state.gameOver) return;
    const playerId = state.currentPlayer;
    const { width, height } = getCurrentDims();
    const { moves, fullRequired } = enumerateMovesFor(playerId, width, height);

    state.allowedMoves = moves;
    state.fullAdjacencyRequired = fullRequired;
    state.hoverMoveKey = null;
    state.selectedMoveKey = null;

    if (moves.length === 0) {
      const loser = state.settings.players[playerId];
      const winnerId = playerId === 0 ? 1 : 0;
      const winner = state.settings.players[winnerId];
      endGame(
        winnerId,
        `${loser.name} не может поставить прямоугольник ${width}×${height}. Побеждает ${winner.name}.`
      );
      return;
    }

    render();
  }

  function placeRect(move) {
    const rect = {
      playerId: state.currentPlayer,
      x: move.x,
      y: move.y,
      width: move.width,
      height: move.height
    };
    state.rects.push(rect);

    for (let row = rect.y; row < rect.y + rect.height; row++) {
      for (let col = rect.x; col < rect.x + rect.width; col++) {
        state.board[row][col] = rect.playerId;
      }
    }
  }

  function nextTurn() {
    state.currentPlayer = state.currentPlayer === 0 ? 1 : 0;
    state.turnRoll = generateRoll(state.settings.maxRoll);
    state.orientationSwapped = false;
    recalcMovesAndHandleDefeat();
  }

  function endGame(winnerId, reason) {
    state.gameOver = true;
    state.winnerId = winnerId;
    state.endReason = reason;
    ui.endMessage.textContent = reason;
    ui.endModal.classList.remove('hidden');
    render();
  }

  function resetMatch() {
    state.board = createEmptyBoard(state.settings.width, state.settings.height);
    state.currentPlayer = 0;
    state.turnRoll = generateRoll(state.settings.maxRoll);
    state.orientationSwapped = false;
    state.rects = [];
    state.allowedMoves = [];
    state.fullAdjacencyRequired = false;
    state.hoverMoveKey = null;
    state.selectedMoveKey = null;
    state.gameOver = false;
    state.winnerId = null;
    state.endReason = '';
    ui.endModal.classList.add('hidden');

    prepareBoardSvg();
    recalcMovesAndHandleDefeat();
  }

  function collectSettings() {
    const width = clamp(Number(ui.fieldWidth.value) || DEFAULTS.width, 10, 120);
    const height = clamp(Number(ui.fieldHeight.value) || DEFAULTS.height, 10, 100);
    const maxRoll = clamp(Number(ui.maxRoll.value) || DEFAULTS.maxRoll, 3, 20);
    const p1Name = ui.player1Name.value.trim() || 'Игрок 1';
    const p2Name = ui.player2Name.value.trim() || 'Игрок 2';

    return {
      width,
      height,
      maxRoll,
      players: [
        { id: 0, name: p1Name, color: ui.player1Color.value, startCorner: 'tl' },
        { id: 1, name: p2Name, color: ui.player2Color.value, startCorner: 'br' }
      ]
    };
  }

  function prepareBoardSvg() {
    const w = state.settings.width * CELL_SIZE;
    const h = state.settings.height * CELL_SIZE;
    ui.gameBoard.setAttribute('viewBox', `0 0 ${w} ${h}`);
    ui.gameBoard.setAttribute('width', String(w));
    ui.gameBoard.setAttribute('height', String(h));
  }

  function drawGrid(svg) {
    const w = state.settings.width * CELL_SIZE;
    const h = state.settings.height * CELL_SIZE;

    for (let x = 0; x <= state.settings.width; x++) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x * CELL_SIZE));
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(x * CELL_SIZE));
      line.setAttribute('y2', String(h));
      line.setAttribute('stroke', GRID_LINE_COLOR);
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }

    for (let y = 0; y <= state.settings.height; y++) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', String(y * CELL_SIZE));
      line.setAttribute('x2', String(w));
      line.setAttribute('y2', String(y * CELL_SIZE));
      line.setAttribute('stroke', GRID_LINE_COLOR);
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }
  }

  function renderBoard() {
    const svg = ui.gameBoard;
    svg.innerHTML = '';

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(state.settings.width * CELL_SIZE));
    bg.setAttribute('height', String(state.settings.height * CELL_SIZE));
    bg.setAttribute('fill', '#fff');
    svg.appendChild(bg);

    // Слои подсветки допустимых позиций без заливки, чтобы не было наложения цветов
    for (const move of state.allowedMoves) {
      const key = moveKey(move);
      const isHover = state.hoverMoveKey === key;
      const isSelected = state.selectedMoveKey === key;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(move.x * CELL_SIZE));
      rect.setAttribute('y', String(move.y * CELL_SIZE));
      rect.setAttribute('width', String(move.width * CELL_SIZE));
      rect.setAttribute('height', String(move.height * CELL_SIZE));
      rect.setAttribute('fill', 'none');
      rect.setAttribute(
        'stroke',
        isSelected ? MOVE_SELECTED_OUTLINE_COLOR : isHover ? MOVE_HOVER_OUTLINE_COLOR : MOVE_OUTLINE_COLOR
      );
      rect.setAttribute('stroke-dasharray', isSelected ? '0' : move.full ? '3 2' : '8 4');
      rect.setAttribute('stroke-width', isSelected ? '4' : isHover ? '3' : '2');
      svg.appendChild(rect);
    }

    // Поставленные прямоугольники игроков
    for (const placed of state.rects) {
      const color = state.settings.players[placed.playerId].color;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(placed.x * CELL_SIZE));
      rect.setAttribute('y', String(placed.y * CELL_SIZE));
      rect.setAttribute('width', String(placed.width * CELL_SIZE));
      rect.setAttribute('height', String(placed.height * CELL_SIZE));
      rect.setAttribute('fill', rgba(color, 0.75));
      rect.setAttribute('stroke', rgba(color, 1));
      rect.setAttribute('stroke-width', '2');
      rect.style.transition = 'all 120ms ease-out';
      svg.appendChild(rect);
    }

    drawGrid(svg);
  }

  function renderPanel() {
    const p = state.settings.players[state.currentPlayer];
    const dims = getCurrentDims();

    ui.currentPlayerName.textContent = p.name;
    ui.currentPlayerName.style.color = p.color;
    ui.rollText.textContent = `${state.turnRoll.a} и ${state.turnRoll.b}`;
    ui.orientationText.textContent = `Ориентация: ${dims.width}×${dims.height}`;

    if (isFirstMove(state.currentPlayer)) {
      ui.adjacencyStatus.textContent = 'Первый ход: прямоугольник должен включать стартовый угол игрока.';
    } else {
      ui.adjacencyStatus.textContent = state.fullAdjacencyRequired
        ? 'Сейчас разрешены только варианты с полным прилеганием.'
        : 'Полных вариантов нет, разрешены частичные.';
    }

    const hasSelected = Boolean(state.selectedMoveKey);
    ui.confirmBtn.disabled = !hasSelected || state.gameOver;
    ui.clearSelectionBtn.disabled = !hasSelected;
    ui.rotateBtn.disabled = state.gameOver;
  }

  function render() {
    renderBoard();
    renderPanel();
  }

  function cellFromPointer(clientX, clientY) {
    const rect = ui.gameBoard.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((clientY - rect.top) / CELL_SIZE);
    return { x, y };
  }

  function findMoveByCell(cellX, cellY) {
    return state.allowedMoves.find(
      (m) => cellX >= m.x && cellX < m.x + m.width && cellY >= m.y && cellY < m.y + m.height
    );
  }

  function onPointerMove(ev) {
    if (state.gameOver) return;
    const pt = cellFromPointer(ev.clientX, ev.clientY);
    const move = findMoveByCell(pt.x, pt.y);
    state.hoverMoveKey = move ? moveKey(move) : null;
    render();
  }

  function onPointerLeave() {
    state.hoverMoveKey = null;
    render();
  }

  function onPointerDown(ev) {
    if (state.gameOver) return;
    const pt = cellFromPointer(ev.clientX, ev.clientY);
    const move = findMoveByCell(pt.x, pt.y);
    state.selectedMoveKey = move ? moveKey(move) : null;
    state.hoverMoveKey = state.selectedMoveKey;
    render();
  }

  function bindEvents() {
    ui.startGameBtn.addEventListener('click', () => {
      state.settings = collectSettings();
      ui.setupScreen.classList.add('hidden');
      ui.gameScreen.classList.remove('hidden');
      resetMatch();
    });

    ui.rotateBtn.addEventListener('click', () => {
      if (state.gameOver) return;
      state.orientationSwapped = !state.orientationSwapped;
      recalcMovesAndHandleDefeat();
    });

    ui.confirmBtn.addEventListener('click', () => {
      if (!state.selectedMoveKey || state.gameOver) return;
      const selected = state.allowedMoves.find((m) => moveKey(m) === state.selectedMoveKey);
      if (!selected) return;
      placeRect(selected);
      nextTurn();
    });

    ui.clearSelectionBtn.addEventListener('click', () => {
      state.selectedMoveKey = null;
      state.hoverMoveKey = null;
      render();
    });

    ui.newMatchBtn.addEventListener('click', resetMatch);

    ui.backToSetupBtn.addEventListener('click', () => {
      ui.gameScreen.classList.add('hidden');
      ui.setupScreen.classList.remove('hidden');
      ui.endModal.classList.add('hidden');
    });

    ui.playAgainBtn.addEventListener('click', () => {
      ui.endModal.classList.add('hidden');
      resetMatch();
    });

    ui.toSetupBtn.addEventListener('click', () => {
      ui.endModal.classList.add('hidden');
      ui.gameScreen.classList.add('hidden');
      ui.setupScreen.classList.remove('hidden');
    });

    ui.gameBoard.addEventListener('pointermove', onPointerMove);
    ui.gameBoard.addEventListener('pointerleave', onPointerLeave);
    ui.gameBoard.addEventListener('pointerdown', onPointerDown);
  }

  bindEvents();
})();
