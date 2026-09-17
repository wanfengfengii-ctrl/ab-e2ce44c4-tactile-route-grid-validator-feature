import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  CELL_TYPES,
  GRID_SIZE,
  type CellType,
  type Grid,
  compareRowMajor,
  countCellTypes,
  validateGrid,
} from './grid';
import { GridImportError, gridToJson, parseGridJson } from './io';
import { GridBoard } from './components/GridBoard';

const TOOL_LABELS: Record<CellType, string> = {
  empty: '空白',
  obstacle: '障碍',
  guide: '导向砖',
  entrance: '入口',
  shelter: '避难点',
};

const TOOL_KEYS: Record<string, CellType> = {
  '1': 'empty',
  '2': 'obstacle',
  '3': 'guide',
  '4': 'entrance',
  '5': 'shelter',
};

function initialGrid(): Grid {
  // 预置一个“对角相碰、实际断链”的示例，便于一眼看到校验效果。
  const grid: Grid = Array.from({ length: GRID_SIZE }, () =>
    Array<CellType>(GRID_SIZE).fill('empty'),
  );
  grid[1][1] = 'entrance';
  grid[1][2] = 'guide';
  grid[2][3] = 'guide'; // 与 (1,2) 仅对角接触
  grid[3][3] = 'guide';
  grid[3][4] = 'shelter';
  grid[2][2] = 'obstacle';
  return grid;
}

export default function App() {
  const [grid, setGrid] = useState<Grid>(initialGrid);
  const [tool, setTool] = useState<CellType>('guide');
  const [focus, setFocus] = useState({ row: 0, col: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 网格任意变化即重算，旧结果被立即替换。
  const failure = useMemo(() => validateGrid(grid), [grid]);
  const counts = useMemo(() => countCellTypes(grid), [grid]);

  const endpointsValid =
    counts.entrance >= 1 &&
    counts.entrance <= 4 &&
    counts.shelter >= 1 &&
    counts.shelter <= 4;

  const reachableKeys = useMemo(() => {
    if (!failure) return new Set<number>();
    return new Set(
      failure.reachable
        .slice()
        .sort(compareRowMajor)
        .map(({ row, col }) => row * GRID_SIZE + col),
    );
  }, [failure]);

  const blockingKeys = useMemo(() => {
    if (!failure) return new Set<number>();
    return new Set(
      failure.blockingObstacles.map(
        ({ row, col }) => row * GRID_SIZE + col,
      ),
    );
  }, [failure]);

  const paintCell = useCallback(
    (row: number, col: number, type: CellType) => {
      setGrid((prev) => {
        if (prev[row][col] === type) return prev;
        const next = prev.map((r) => [...r]);
        next[row][col] = type;
        return next;
      });
      setImportError(null);
    },
    [],
  );

  const moveFocus = useCallback((dr: number, dc: number) => {
    setFocus((prev) => ({
      row: Math.min(GRID_SIZE - 1, Math.max(0, prev.row + dr)),
      col: Math.min(GRID_SIZE - 1, Math.max(0, prev.col + dc)),
    }));
  }, []);

  const onCellKeyDown = useCallback(
    (event: ReactKeyboardEvent, row: number, col: number) => {
      const toolForKey = TOOL_KEYS[event.key];
      if (toolForKey) {
        event.preventDefault();
        setTool(toolForKey);
        paintCell(row, col, toolForKey);
        return;
      }
      switch (event.key) {
        case 'Enter':
        case ' ':
          event.preventDefault();
          paintCell(row, col, tool);
          break;
        case 'Backspace':
        case 'Delete':
          event.preventDefault();
          paintCell(row, col, 'empty');
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveFocus(-1, 0);
          break;
        case 'ArrowDown':
          event.preventDefault();
          moveFocus(1, 0);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          moveFocus(0, -1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          moveFocus(0, 1);
          break;
        default:
          break;
      }
    },
    [moveFocus, paintCell, tool],
  );

  // 导入被拒绝时：整份拒绝（保留当前网格）、清除旧结论、显示错误。
  const rejectImport = useCallback((message: string) => {
    setImportError(message);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const onImportFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = parseGridJson(text);
        setGrid(parsed);
        setImportError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (error) {
        const message =
          error instanceof GridImportError
            ? error.message
            : `导入被拒绝：无法读取文件（${(error as Error).message}）。`;
        rejectImport(message);
      }
    },
    [rejectImport],
  );

  const onFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void onImportFile(file);
    },
    [onImportFile],
  );

  const onExport = useCallback(() => {
    const blob = new Blob([gridToJson(grid)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tactile-grid.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [grid]);

  const onClearAll = useCallback(() => {
    setGrid(
      Array.from({ length: GRID_SIZE }, () =>
        Array<CellType>(GRID_SIZE).fill('empty'),
      ),
    );
    setImportError(null);
  }, []);

  // 导入失败时不展示旧判定结论（旧结论被错误提示替换）。
  const resultSuppressed = importError !== null;

  return (
    <main className="app">
      <header className="app-header">
        <h1>触觉导向砖连通性校验器</h1>
        <p className="subtitle">
          12×12 网格 · 仅共享边的入口 / 导向砖 / 避难点可通行 · 对角角点相碰不算连接
        </p>
      </header>

      <section className="toolbar" aria-label="编辑工具">
        <div className="tool-group" role="radiogroup" aria-label="格类型工具">
          {CELL_TYPES.map((type, index) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={tool === type}
              className={`tool-button tool-${type} ${tool === type ? 'is-active' : ''}`}
              onClick={() => setTool(type)}
              title={`快捷键 ${index + 1}`}
              data-testid={`tool-${type}`}
            >
              <span className="tool-swatch" aria-hidden="true" />
              {TOOL_LABELS[type]}
              <kbd>{index + 1}</kbd>
            </button>
          ))}
        </div>
        <div className="io-group">
          <button
            type="button"
            className="action-button"
            onClick={() => fileInputRef.current?.click()}
            data-testid="import-button"
          >
            导入 JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={onFileInputChange}
            className="visually-hidden"
            data-testid="import-file"
          />
          <button
            type="button"
            className="action-button"
            onClick={onExport}
            data-testid="export-button"
          >
            导出 JSON
          </button>
          <button
            type="button"
            className="action-button action-button--ghost"
            onClick={onClearAll}
            data-testid="clear-button"
          >
            清空
          </button>
        </div>
      </section>

      <div className="content">
        <GridBoard
          grid={grid}
          focus={focus}
          tool={tool}
          reachableKeys={reachableKeys}
          blockingKeys={blockingKeys}
          failedEntrance={failure?.entrance ?? null}
          failedShelter={failure?.shelter ?? null}
          showOverlay={!resultSuppressed && failure !== null}
          onPaint={paintCell}
          onFocusChange={setFocus}
          onCellKeyDown={onCellKeyDown}
        />

        <aside className="panel" aria-label="校验结果">
          <h2>校验结果</h2>
          <p className="counts" data-testid="endpoint-counts">
            入口 <strong data-testid="count-entrance">{counts.entrance}</strong>
            {' / '}
            避难点 <strong data-testid="count-shelter">{counts.shelter}</strong>
            （各需 1–4 个）
          </p>

          {importError !== null && (
            <div className="banner banner--error" role="alert" data-testid="import-error">
              <strong>导入失败，已整份拒绝：</strong>
              <pre className="error-detail">{importError}</pre>
            </div>
          )}

          {importError === null && !endpointsValid && (
            <div className="banner banner--warn" role="status" data-testid="setup-warning">
              当前网格入口或避难点数量不在 1–4 个范围内，请先放置端点再进行校验。
            </div>
          )}

          {importError === null && endpointsValid && failure === null && (
            <div className="banner banner--ok" role="status" data-testid="result-ok">
              ✔ 通过：每个入口都能沿导向砖（正交共享边）到达每个避难点。
            </div>
          )}

          {importError === null && endpointsValid && failure !== null && (
            <div className="banner banner--fail" role="alert" data-testid="result-fail">
              <strong>✘ 存在不可达关系</strong>
              <p>
                按行优先排序后的首个不可达对：入口（第
                {' '}
                <span data-testid="fail-entrance-row">
                  {failure.entrance.row + 1}
                </span>
                行第
                <span data-testid="fail-entrance-col">
                  {failure.entrance.col + 1}
                </span>
                列） → 避难点（第
                <span data-testid="fail-shelter-row">
                  {failure.shelter.row + 1}
                </span>
                行第
                <span data-testid="fail-shelter-col">
                  {failure.shelter.col + 1}
                </span>
                列）。
              </p>
              <p data-testid="reach-count">
                该入口实际可达 <strong>{failure.reachable.length}</strong> 格
                （青色高亮）；与其共享边的障碍格有
                <strong> {failure.blockingObstacles.length}</strong> 个（红色高亮）。
              </p>
              <p className="hint">
                补上一块与现有砖形成正交（共享边）连接的导向砖后，结果会立即重算。
              </p>
            </div>
          )}

          <section className="legend">
            <h3>图例与操作</h3>
            <ul>
              <li><span className="swatch swatch-guide" />导向砖（可通行）</li>
              <li><span className="swatch swatch-entrance" />入口</li>
              <li><span className="swatch swatch-shelter" />避难点</li>
              <li><span className="swatch swatch-obstacle" />障碍（不可通行）</li>
              <li><span className="swatch swatch-empty" />空白（不可通行）</li>
              <li><span className="swatch swatch-reachable" />可达区域高亮</li>
              <li><span className="swatch swatch-blocking" />相邻障碍高亮</li>
            </ul>
            <p className="hint">
              鼠标 / 触摸：选择工具后点击或拖拽格子。<br />
              键盘：方向键移动焦点，数字 1–5 选择工具并落笔，
              Enter / 空格写入当前工具，Delete 擦除。
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
