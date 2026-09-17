import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  GRID_SIZE,
  type Cell,
  type CellType,
  type Grid,
  cellKey,
} from '../grid';

interface GridBoardProps {
  grid: Grid;
  focus: Cell;
  tool: CellType;
  reachableKeys: ReadonlySet<number>;
  blockingKeys: ReadonlySet<number>;
  failedEntrance: Cell | null;
  failedShelter: Cell | null;
  showOverlay: boolean;
  /** 审计中选中的关键砖（cellKey），null 表示未选中。 */
  auditBrickKey: number | null;
  /** 选中关键砖影响到的入口 / 避难点（cellKey 集合）。 */
  auditEndpointKeys: ReadonlySet<number>;
  onPaint: (row: number, col: number, type: CellType) => void;
  onFocusChange: (cell: Cell) => void;
  onCellKeyDown: (
    event: ReactKeyboardEvent,
    row: number,
    col: number,
  ) => void;
}

const CELL_LABELS: Record<CellType, string> = {
  empty: '空白',
  obstacle: '障碍',
  guide: '导向砖',
  entrance: '入口',
  shelter: '避难点',
};

const CELL_GLYPHS: Record<CellType, string> = {
  empty: '',
  obstacle: '▦',
  guide: '⋯',
  entrance: '入',
  shelter: '避',
};

export function GridBoard({
  grid,
  focus,
  tool,
  reachableKeys,
  blockingKeys,
  failedEntrance,
  failedShelter,
  showOverlay,
  auditBrickKey,
  auditEndpointKeys,
  onPaint,
  onFocusChange,
  onCellKeyDown,
}: GridBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const toolRef = useRef(tool);
  toolRef.current = tool;

  // 让 DOM 焦点跟随方向键移动后的 focus 状态。
  useEffect(() => {
    const button = boardRef.current?.querySelector<HTMLButtonElement>(
      `[data-row="${focus.row}"][data-col="${focus.col}"]`,
    );
    button?.focus();
  }, [focus]);

  const paintAtPoint = useCallback(
    (clientX: number, clientY: number, focusCell = false) => {
      const element = document
        .elementFromPoint(clientX, clientY)
        ?.closest<HTMLButtonElement>('button[data-row]');
      if (!element || !boardRef.current?.contains(element)) return;
      const row = Number(element.dataset.row);
      const col = Number(element.dataset.col);
      if (focusCell) element.focus({ preventScroll: true });
      onPaint(row, col, toolRef.current);
    },
    [onPaint],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // 仅主键（鼠标左键 / 触摸 / 笔接触）触发落笔。
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      draggingRef.current = true;
      boardRef.current?.setPointerCapture(event.pointerId);
      paintAtPoint(event.clientX, event.clientY, true);
    },
    [paintAtPoint],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      // 触摸存在隐式指针捕获，用 elementFromPoint 找到指尖下的格。
      paintAtPoint(event.clientX, event.clientY);
    },
    [paintAtPoint],
  );

  const stopDragging = useCallback(() => {
    draggingRef.current = false;
  }, []);

  return (
    <div
      ref={boardRef}
      className="board"
      role="grid"
      aria-label="12 乘 12 格编辑画布"
      aria-rowcount={GRID_SIZE}
      aria-colcount={GRID_SIZE}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onPointerLeave={stopDragging}
    >
      {grid.map((row, rowIndex) =>
        row.map((type, colIndex) => {
          const key = cellKey(rowIndex, colIndex);
          const isReachable = showOverlay && reachableKeys.has(key);
          const isBlocking = showOverlay && blockingKeys.has(key);
          const isFailedEntrance =
            showOverlay &&
            failedEntrance !== null &&
            failedEntrance.row === rowIndex &&
            failedEntrance.col === colIndex;
          const isFailedShelter =
            showOverlay &&
            failedShelter !== null &&
            failedShelter.row === rowIndex &&
            failedShelter.col === colIndex;
          const isAuditBrick = auditBrickKey === key;
          const isAuditEndpoint = auditEndpointKeys.has(key);
          const classNames = [
            'cell',
            `cell-${type}`,
            isReachable ? 'is-reachable' : '',
            isBlocking ? 'is-blocking' : '',
            isFailedEntrance ? 'is-failed-entrance' : '',
            isFailedShelter ? 'is-failed-shelter' : '',
            isAuditBrick ? 'is-audit-brick' : '',
            isAuditEndpoint ? 'is-audit-endpoint' : '',
            focus.row === rowIndex && focus.col === colIndex
              ? 'is-focused'
              : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              data-row={rowIndex}
              data-col={colIndex}
              data-type={type}
              data-testid={`cell-${rowIndex}-${colIndex}`}
              className={classNames}
              aria-label={`第 ${rowIndex + 1} 行第 ${colIndex + 1} 列，${CELL_LABELS[type]}`}
              aria-selected={focus.row === rowIndex && focus.col === colIndex}
              onFocus={() => onFocusChange({ row: rowIndex, col: colIndex })}
              onKeyDown={(event) =>
                onCellKeyDown(event, rowIndex, colIndex)
              }
              // 阻止按钮在拖拽过程中抢焦点；键盘 Tab 仍可聚焦。
              tabIndex={focus.row === rowIndex && focus.col === colIndex ? 0 : -1}
            >
              <span className="cell-glyph" aria-hidden="true">
                {CELL_GLYPHS[type]}
              </span>
            </button>
          );
        }),
      )}
    </div>
  );
}
