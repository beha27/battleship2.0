const BOARD_SIZE = 10;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']; // Английские буквы
const SHIP_TYPES = [4, 3, 2, 2]; // 1x4-палубный, 1x3-палубный, 2x2-палубных (всего 4 корабля)

let gameState = 'menu';
let gameMode = 'pve'; 
let currentShipIndex = 0;
let shipOrientation = 'horizontal';

let playerBoard = makeEmptyBoard();
let enemyBoard = makeEmptyBoard();
let playerShips = [];
let enemyShips = [];

let isMyTurn = true;
let peer = null;
let conn = null;
let isHost = false;

let myReady = false;
let enemyReady = false;

function makeEmptyBoard() {
    return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
}

function showScreen(screenId) {
    ['screen-menu', 'screen-create-room', 'screen-join-room', 'screen-placement', 'screen-battle'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
}

function setStatus(text) {
    document.getElementById('status-bar').innerText = text;
}

function showGameOverModal(title, text) {
    gameState = 'over';
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-text').innerText = text;
    document.getElementById('modal-gameover').classList.remove('hidden');
}

function backToMenu() {
    document.getElementById('modal-gameover').classList.add('hidden');
    if (peer) {
        peer.destroy();
        peer = null;
        conn = null;
    }
    gameState = 'menu';
    showScreen('screen-menu');
    setStatus('Главное меню: выберите режим игры');
}

function startGameMode(mode) {
    gameMode = mode;
    currentShipIndex = 0;
    playerBoard = makeEmptyBoard();
    playerShips = [];
    myReady = false;
    enemyReady = false;
    
    showScreen('screen-placement');
    renderPlacementBoard();
    updateFleetUI();
    
    const btnStart = document.getElementById('btn-start-battle');
    btnStart.disabled = true;
    btnStart.innerText = 'Готов к бою';
    btnStart.className = 'w-full py-3.5 bg-emerald-600/40 text-slate-400 cursor-not-allowed font-bold rounded-2xl transition shadow-lg';
    
    setStatus('Расставьте свой флот (4-палубный, 3-палубный и два 2-палубных)');
}

// --- PeerJS Integration ---
function initPeer() {
    if (peer) return;
    peer = new Peer();
    
    peer.on('open', (id) => {
        document.getElementById('my-peer-id-display').innerText = id;
    });

    peer.on('connection', (connection) => {
        conn = connection;
        isHost = true;
        setupConnectionHandlers();
        document.getElementById('room-status').innerText = 'Друг успешно подключился!';
        setTimeout(() => {
            startGameMode('pvp');
        }, 1000);
    });
}

function openCreateRoomScreen() {
    isHost = true;
    showScreen('screen-create-room');
    document.getElementById('my-peer-id-display').innerText = 'Генерация ID...';
    document.getElementById('room-status').innerText = 'Ожидание подключения друга...';
    initPeer();
    setStatus('Создана комната. Передайте ID другу');
}

function copyPeerId() {
    const idText = document.getElementById('my-peer-id-display').innerText;
    navigator.clipboard.writeText(idText).then(() => {
        setStatus('ID комнаты скопирован в буфер обмена!');
    });
}

function openJoinRoomScreen() {
    isHost = false;
    showScreen('screen-join-room');
    initPeer();
    setStatus('Введите ID комнаты друга для подключения');
}

function connectToRoom() {
    const remoteId = document.getElementById('peer-id-input').value.trim();
    if (!remoteId) {
        alert('Пожалуйста, введите ID комнаты!');
        return;
    }
    setStatus('Подключение к комнате...');
    conn = peer.connect(remoteId);
    
    conn.on('open', () => {
        setupConnectionHandlers();
        setStatus('Подключено к комнате! Расставьте флот');
        startGameMode('pvp');
    });

    conn.on('error', (err) => {
        alert('Ошибка соединения: ' + err);
        setStatus('Ошибка подключения');
    });
}

function setupConnectionHandlers() {
    conn.on('data', (data) => {
        handleNetworkData(data);
    });
    conn.on('close', () => {
        alert('Соединение с противником разорвано.');
        backToMenu();
    });
}

function sendData(data) {
    if (conn && conn.open) {
        conn.send(data);
    }
}

// --- Placement Logic ---
function renderPlacementBoard() {
    const container = document.getElementById('placement-board');
    container.className = 'board-grid';
    container.innerHTML = '';

    // Top-left corner
    const corner = document.createElement('div');
    corner.className = 'grid-header';
    container.appendChild(corner);

    // Header Letters
    for (let c = 0; c < BOARD_SIZE; c++) {
        const hCell = document.createElement('div');
        hCell.className = 'grid-header';
        hCell.innerText = LETTERS[c];
        container.appendChild(hCell);
    }

    for (let r = 0; r < BOARD_SIZE; r++) {
        // Row Number Header
        const numCell = document.createElement('div');
        numCell.className = 'grid-header';
        numCell.innerText = r + 1;
        container.appendChild(numCell);

        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'board-cell cursor-pointer';
            
            if (playerBoard[r][c] === 1) {
                cell.classList.add('cell-ship');
            } else {
                cell.classList.add('cell-empty');
            }

            cell.addEventListener('click', () => handlePlacementClick(r, c));
            container.appendChild(cell);
        }
    }
}

function rotateShip() {
    shipOrientation = shipOrientation === 'horizontal' ? 'vertical' : 'horizontal';
    setStatus(`Поворот корабля: ${shipOrientation === 'horizontal' ? 'Горизонтально' : 'Вертикально'}`);
}

function canPlaceShip(board, size, row, col, orientation) {
    for (let i = 0; i < size; i++) {
        let r = row + (orientation === 'vertical' ? i : 0);
        let c = col + (orientation === 'horizontal' ? i : 0);
        if (r >= BOARD_SIZE || c >= BOARD_SIZE) return false;
        if (board[r][c] !== 0) return false;

        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                let nr = r + dr;
                let nc = c + dc;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                    if (board[nr][nc] === 1) return false;
                }
            }
        }
    }
    return true;
}

function handlePlacementClick(row, col) {
    if (currentShipIndex >= SHIP_TYPES.length || myReady) return;
    let size = SHIP_TYPES[currentShipIndex];

    if (canPlaceShip(playerBoard, size, row, col, shipOrientation)) {
        let shipCoords = [];
        for (let i = 0; i < size; i++) {
            let r = row + (shipOrientation === 'vertical' ? i : 0);
            let c = col + (shipOrientation === 'horizontal' ? i : 0);
            playerBoard[r][c] = 1;
            shipCoords.push({r, c});
        }
        playerShips.push({size, coords: shipCoords, hits: 0});
        currentShipIndex++;
        renderPlacementBoard();
        updateFleetUI();

        if (currentShipIndex >= SHIP_TYPES.length) {
            const btn = document.getElementById('btn-start-battle');
            btn.disabled = false;
            btn.className = 'w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-2xl transition shadow-lg cursor-pointer';
            setStatus('Весь флот расставлен! Нажмите «Готов к бою»');
        } else {
            setStatus(`Расставьте ${SHIP_TYPES[currentShipIndex]}-палубный корабль`);
        }
    } else {
        setStatus('Сюда нельзя поставить корабль (правило соприкосновений)!');
    }
}

function autoDeploy() {
    if (myReady) return;
    playerBoard = makeEmptyBoard();
    playerShips = [];
    currentShipIndex = 0;

    for (let size of SHIP_TYPES) {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 200) {
            attempts++;
            let orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
            let r = Math.floor(Math.random() * BOARD_SIZE);
            let c = Math.floor(Math.random() * BOARD_SIZE);
            if (canPlaceShip(playerBoard, size, r, c, orientation)) {
                let shipCoords = [];
                for (let i = 0; i < size; i++) {
                    let nr = r + (orientation === 'vertical' ? i : 0);
                    let nc = c + (orientation === 'horizontal' ? i : 0);
                    playerBoard[nr][nc] = 1;
                    shipCoords.push({r: nr, c: nc});
                }
                playerShips.push({size, coords: shipCoords, hits: 0});
                placed = true;
            }
        }
    }
    currentShipIndex = SHIP_TYPES.length;
    renderPlacementBoard();
    updateFleetUI();
    
    const btn = document.getElementById('btn-start-battle');
    btn.disabled = false;
    btn.className = 'w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-2xl transition shadow-lg cursor-pointer';
    setStatus('Флот расставлен случайно! Нажмите «Готов к бою»');
}

function resetPlacement() {
    if (myReady) return;
    playerBoard = makeEmptyBoard();
    playerShips = [];
    currentShipIndex = 0;
    renderPlacementBoard();
    updateFleetUI();
    
    const btn = document.getElementById('btn-start-battle');
    btn.disabled = true;
    btn.className = 'w-full py-3.5 bg-emerald-600/40 text-slate-400 cursor-not-allowed font-bold rounded-2xl transition shadow-lg';
    setStatus('Расставьте свой флот заново');
}

function updateFleetUI() {
    const listIds = ['fleet-4', 'fleet-3', 'fleet-2-1', 'fleet-2-2'];
    for (let i = 0; i < SHIP_TYPES.length; i++) {
        let li = document.getElementById(listIds[i]);
        if (i < currentShipIndex) {
            li.classList.add('opacity-40', 'line-through');
        } else if (i === currentShipIndex) {
            li.classList.add('border-cyan-500', 'bg-cyan-950/60');
            li.classList.remove('opacity-40', 'line-through');
        } else {
            li.classList.remove('opacity-40', 'line-through', 'border-cyan-500', 'bg-cyan-950/60');
        }
    }
}

function finishPlacement() {
    if (gameMode === 'pve') {
        showScreen('screen-battle');
        setupEnemyBot();
        renderBattleBoards();
        isMyTurn = true;
        setStatus('Ваш ход! Стреляйте по полю противника');
    } else {
        myReady = true;
        sendData({ type: 'ready' });

        const btn = document.getElementById('btn-start-battle');
        btn.disabled = true;
        btn.innerText = 'Ожидание противника...';
        btn.className = 'w-full py-3.5 bg-amber-600/40 text-amber-200 cursor-not-allowed font-bold rounded-2xl transition shadow-lg animate-pulse';

        if (enemyReady) {
            startPvPBattle();
        } else {
            setStatus('Вы готовы! Ожидание готовности соперника...');
        }
    }
}

function startPvPBattle() {
    showScreen('screen-battle');
    enemyBoard = makeEmptyBoard();
    renderBattleBoards();
    isMyTurn = isHost;
    setStatus(isMyTurn ? 'Оба игрока готовы! Ваш ход, стреляйте!' : 'Оба игрока готовы! Ход противника, ожидайте...');
}

// --- PvE Bot Logic ---
function setupEnemyBot() {
    enemyBoard = makeEmptyBoard();
    enemyShips = [];
    for (let size of SHIP_TYPES) {
        let placed = false;
        while (!placed) {
            let orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
            let r = Math.floor(Math.random() * BOARD_SIZE);
            let c = Math.floor(Math.random() * BOARD_SIZE);
            if (canPlaceShip(enemyBoard, size, r, c, orientation)) {
                let shipCoords = [];
                for (let i = 0; i < size; i++) {
                    let nr = r + (orientation === 'vertical' ? i : 0);
                    let nc = c + (orientation === 'horizontal' ? i : 0);
                    enemyBoard[nr][nc] = 1;
                    shipCoords.push({r: nr, c: nc});
                }
                enemyShips.push({size, coords: shipCoords, hits: 0, sunk: false});
                placed = true;
            }
        }
    }
}

function renderBattleBoards() {
    // 1. Player Board
    const pContainer = document.getElementById('player-battle-board');
    pContainer.className = 'board-grid';
    pContainer.innerHTML = '';

    const pCorner = document.createElement('div');
    pCorner.className = 'grid-header';
    pContainer.appendChild(pCorner);

    for (let c = 0; c < BOARD_SIZE; c++) {
        const hCell = document.createElement('div');
        hCell.className = 'grid-header';
        hCell.innerText = LETTERS[c];
        pContainer.appendChild(hCell);
    }

    for (let r = 0; r < BOARD_SIZE; r++) {
        const numCell = document.createElement('div');
        numCell.className = 'grid-header';
        numCell.innerText = r + 1;
        pContainer.appendChild(numCell);

        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'board-cell';
            let val = playerBoard[r][c];

            if (val === 1) {
                cell.classList.add('cell-ship');
            } else if (val === 2) {
                cell.classList.add('cell-miss');
                cell.innerText = '💧';
            } else if (val === 3) {
                cell.classList.add('cell-hit');
                cell.innerText = '🔥';
            } else if (val === 'sunk') {
                cell.classList.add('cell-sunk');
                cell.innerText = '✕';
            } else {
                cell.classList.add('cell-empty');
            }
            pContainer.appendChild(cell);
        }
    }

    // 2. Enemy Board
    const eContainer = document.getElementById('enemy-battle-board');
    eContainer.className = 'board-grid';
    eContainer.innerHTML = '';

    const eCorner = document.createElement('div');
    eCorner.className = 'grid-header';
    eContainer.appendChild(eCorner);

    for (let c = 0; c < BOARD_SIZE; c++) {
        const hCell = document.createElement('div');
        hCell.className = 'grid-header';
        hCell.innerText = LETTERS[c];
        eContainer.appendChild(hCell);
    }

    for (let r = 0; r < BOARD_SIZE; r++) {
        const numCell = document.createElement('div');
        numCell.className = 'grid-header';
        numCell.innerText = r + 1;
        eContainer.appendChild(numCell);

        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'board-cell cursor-pointer';
            let val = enemyBoard[r][c];

            if (val === 2) {
                cell.classList.add('cell-miss');
                cell.innerText = '💧';
            } else if (val === 3) {
                cell.classList.add('cell-hit');
                cell.innerText = '🔥';
            } else if (val === 'sunk') {
                cell.classList.add('cell-sunk');
                cell.innerText = '✕';
            } else {
                cell.classList.add('cell-empty');
            }

            cell.addEventListener('click', () => handlePlayerShot(r, c));
            eContainer.appendChild(cell);
        }
    }
}

function checkAndSinkPlayerShip(r, c) {
    for (let ship of playerShips) {
        let match = ship.coords.some(coord => coord.r === r && coord.c === c);
        if (match) {
            let allHit = ship.coords.every(coord => {
                let v = playerBoard[coord.r][coord.c];
                return v === 3 || v === 'sunk';
            });
            if (allHit) {
                ship.coords.forEach(coord => {
                    playerBoard[coord.r][coord.c] = 'sunk';
                });
                return { sunk: true, coords: ship.coords };
            }
        }
    }
    return { sunk: false, coords: [] };
}

function checkAndSinkShip(board, shipsList, r, c) {
    for (let ship of shipsList) {
        let match = ship.coords.some(coord => coord.r === r && coord.c === c);
        if (match) {
            let allHit = ship.coords.every(coord => {
                let v = board[coord.r][coord.c];
                return v === 3 || v === 'sunk';
            });
            if (allHit && !ship.sunk) {
                ship.sunk = true;
                ship.coords.forEach(coord => {
                    board[coord.r][coord.c] = 'sunk';
                });
                return true;
                    }
        }
    }
    return false;
}

function handlePlayerShot(r, c) {
    if (!isMyTurn || gameState === 'over') return;
    let val = enemyBoard[r][c];
    if (val === 2 || val === 3 || val === 'sunk') return;

    if (gameMode === 'pve') {
        if (enemyBoard[r][c] === 1) {
            enemyBoard[r][c] = 3;
            let sunk = checkAndSinkShip(enemyBoard, enemyShips, r, c);
            if (sunk) {
                setStatus('Корабль противника полностью потоплен! Стреляйте еще раз');
            } else {
                setStatus('Попадание (огонь)! Стреляйте еще раз');
            }
            renderBattleBoards();
            checkWinConditionPvE();
        } else {
            enemyBoard[r][c] = 2;
            isMyTurn = false;
            renderBattleBoards();
            setStatus('Промах! Ход противника...');
            setTimeout(botTurn, 1000);
        }
    } else if (gameMode === 'pvp') {
        sendData({ type: 'shot', r, c });
        isMyTurn = false;
        setStatus('Вы сделали выстрел. Ход противника...');
    }
}

// --- Network Data Handler for PvP ---
function handleNetworkData(data) {
    if (data.type === 'ready') {
        enemyReady = true;
        if (myReady) {
            startPvPBattle();
        } else {
            setStatus('Противник готов к бою! Завершите расстановку.');
        }
    } else if (data.type === 'shot') {
        let r = data.r;
        let c = data.c;
        let hit = (playerBoard[r][c] === 1);
        
        if (hit) {
            playerBoard[r][c] = 3; // 🔥 Пожар при ранении
        } else {
            if (playerBoard[r][c] === 0) {
                playerBoard[r][c] = 2; // 💧 Только вода при промахе
            }
        }

        let sunkInfo = checkAndSinkPlayerShip(r, c);
        renderBattleBoards();

        let hasAliveDecks = playerBoard.some(row => row.includes(1));

        sendData({ 
            type: 'result', 
            r, 
            c, 
            hit, 
            sunk: sunkInfo.sunk, 
            sunkCoords: sunkInfo.coords,
            gameOver: !hasAliveDecks 
        });

        if (!hasAliveDecks) {
            showGameOverModal('Поражение!', 'Ваш флот полностью уничтожен противником.');
            return;
        }

        if (hit) {
            setStatus('Противник попал по вашему кораблю и бьет снова!');
            isMyTurn = false;
        } else {
            setStatus('Противник промахнулся. Ваш ход!');
            isMyTurn = true;
        }
    } else if (data.type === 'result') {
        let r = data.r;
        let c = data.c;
        let hit = data.hit;
        let sunk = data.sunk;
        let sunkCoords = data.sunkCoords || [];
        
        if (hit) {
            enemyBoard[r][c] = 3;
            if (sunk) {
                sunkCoords.forEach(coord => {
                    enemyBoard[coord.r][coord.c] = 'sunk'; // ✕ Крестики если потоплен
                });
            }
            renderBattleBoards();
            if (data.gameOver) {
                showGameOverModal('Победа!', 'Поздравляем! Вы полностью уничтожили флот противника!');
                return;
            }
            setStatus(sunk ? 'Вы полностью потопили корабль противника! Ваш ход снова' : 'Попадание (огонь)! Ваш ход снова');
            isMyTurn = true;
        } else {
            enemyBoard[r][c] = 2; // 💧 Вода при промахе
            renderBattleBoards();
            setStatus('Промах! Ход противника...');
            isMyTurn = false;
        }
    }
}

function checkAndSinkShipSimple(board, startR, startC) {
    let visited = new Set();
    let queue = [{r: startR, c: startC}];
    let group = [];
    let isStandaloneSunk = true;

    let idx = 0;
    while(idx < queue.length) {
        let curr = queue[idx++];
        let key = `${curr.r},${curr.c}`;
        if(visited.has(key)) continue;
        visited.add(key);
        group.push(curr);

        [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr, dc]) => {
            let nr = curr.r + dr, nc = curr.c + dc;
            if(nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                let val = board[nr][nc];
                if(val === 3) {
                    queue.push({r: nr, c: nc});
                } else if(val === 1) {
                    isStandaloneSunk = false;
                }
            }
        });
    }

    if(isStandaloneSunk) {
        group.forEach(cell => {
            board[cell.r][cell.c] = 'sunk';
        });
        return { sunk: true, coords: group };
    }
    return { sunk: false, coords: [] };
}

let botTargetStack = [];
let botCurrentShipHits = [];

function botTurn() {
    if (gameState === 'over') return;

    let r, c;
    if (botTargetStack.length > 0) {
        let target = botTargetStack.pop();
        r = target.r;
        c = target.c;
    } else {
        do {
            r = Math.floor(Math.random() * BOARD_SIZE);
            c = Math.floor(Math.random() * BOARD_SIZE);
        } while (playerBoard[r][c] === 2 || playerBoard[r][c] === 3 || playerBoard[r][c] === 'sunk');
    }

    if (playerBoard[r][c] === 1) {
        playerBoard[r][c] = 3;
        botCurrentShipHits.push({r, c});
        
        let sunkInfo = checkAndSinkShipSimple(playerBoard, r, c);
        if (sunkInfo.sunk) {
            setStatus('Бот полностью потопил ваш корабль!');
            botTargetStack = [];
            botCurrentShipHits = [];
        } else {
            setStatus('Бот попал по вашему кораблю! Он стреляет снова...');
            [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr, dc]) => {
                let nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                    if (playerBoard[nr][nc] !== 2 && playerBoard[nr][nc] !== 3 && playerBoard[nr][nc] !== 'sunk') {
                        botTargetStack.push({r: nr, c: nc});
                    }
                }
            });
        }

        renderBattleBoards();
        checkWinConditionPvE();
        setTimeout(botTurn, 1000);
    } else {
        playerBoard[r][c] = 2;
        isMyTurn = true;
        renderBattleBoards();
        setStatus('Бот промахнулся. Ваш ход!');
    }
}

function checkWinConditionPvE() {
    let enemyAlive = enemyShips.some(ship => !ship.sunk);
    if (!enemyAlive) {
        showGameOverModal('Победа!', 'Поздравляем! Вы полностью уничтожили флот противника!');
        return;
    }

    let playerAlive = false;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (playerBoard[r][c] === 1 || playerBoard[r][c] === 3) {
                playerAlive = true;
            }
        }
    }

    if (!playerAlive) {
        showGameOverModal('Поражение!', 'Бот одержал победу! Ваш флот уничтожен.');
        return;
    }
}
