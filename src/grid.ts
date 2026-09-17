/**
 * 12×12 触觉导向砖网格的核心领域模型与连通性校验。
 *
 * 通行规则：入口(entrance)、导向砖(guide)、避难点(shelter) 均可通行；
 * 两个可通行格只有共享一条边（上/下/左/右）时才算连接，
 * 仅在角点相碰（对角相邻）不算连接。空白与障碍不可通行。
 */

export const GRID_SIZE = 12;

export const CELL_TYPES = [
  'empty',
  'obstacle',
  'guide',
  'entrance',
  'shelter',
] as const;

export type CellType = (typeof CELL_TYPES)[number];

/** grid[row][col]，行优先二维数组。 */
export type Grid = CellType[][];

export interface Cell {
  row: number;
  col: number;
}

/** 可通行的格类型。 */
export const WALKABLE_TYPES: ReadonlySet<CellType> = new Set<CellType>([
  'guide',
  'entrance',
  'shelter',
]);

/** 四正方向邻居；故意不含对角方向。 */
const ORTHOGONAL_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export function createEmptyGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () =>
    Array<CellType>(GRID_SIZE).fill('empty'),
  );
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => [...row]);
}

export function isInside(row: number, col: number): boolean {
  return row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;
}

export function cellKey(row: number, col: number): number {
  return row * GRID_SIZE + col;
}

export function keyToCell(key: number): Cell {
  return { row: Math.floor(key / GRID_SIZE), col: key % GRID_SIZE };
}

export function isWalkable(type: CellType): boolean {
  return WALKABLE_TYPES.has(type);
}

/**
 * 按行优先（row 升序，row 相同则 col 升序）找出某类格。
 * 入口与避难点的挑选顺序都以此为准。
 */
export function findCells(grid: Grid, type: CellType): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (grid[row][col] === type) {
        cells.push({ row, col });
      }
    }
  }
  return cells;
}

/** 行优先比较器。 */
export function compareRowMajor(a: Cell, b: Cell): number {
  return a.row - b.row || a.col - b.col;
}

/**
 * 从起点做正交 BFS，返回全部可达格的 key 集合（含起点自身）。
 * 空白、障碍不可穿越；对角邻居一律不考虑。
 */
export function reachableFrom(grid: Grid, start: Cell): Set<number> {
  const seen = new Set<number>([cellKey(start.row, start.col)]);
  const queue: Cell[] = [{ ...start }];

  while (queue.length > 0) {
    const current = queue.shift() as Cell;
    for (const [dr, dc] of ORTHOGONAL_DELTAS) {
      const nr = current.row + dr;
      const nc = current.col + dc;
      if (!isInside(nr, nc)) continue;
      const key = cellKey(nr, nc);
      if (seen.has(key)) continue;
      if (!isWalkable(grid[nr][nc])) continue;
      seen.add(key);
      queue.push({ row: nr, col: nc });
    }
  }

  return seen;
}

/** 与可达区域中任一格共享边的全部障碍格（行优先排序，去重）。 */
export function findBlockingObstacles(
  grid: Grid,
  reachable: ReadonlySet<number>,
): Cell[] {
  const blocked = new Set<number>();
  for (const key of reachable) {
    const { row, col } = keyToCell(key);
    for (const [dr, dc] of ORTHOGONAL_DELTAS) {
      const nr = row + dr;
      const nc = col + dc;
      if (!isInside(nr, nc)) continue;
      if (grid[nr][nc] !== 'obstacle') continue;
      blocked.add(cellKey(nr, nc));
    }
  }
  return [...blocked].map(keyToCell).sort(compareRowMajor);
}

export interface ValidationFailure {
  /** 行优先顺序下首个不可达对中的入口。 */
  entrance: Cell;
  /** 行优先顺序下首个不可达对中的避难点。 */
  shelter: Cell;
  /** 该入口实际可达的全部格（行优先排序）。 */
  reachable: Cell[];
  /** 与可达区域共享边的全部障碍格（行优先排序）。 */
  blockingObstacles: Cell[];
}

/**
 * 校验：每个入口是否都能沿正交可通行路径到达每个避难点。
 *
 * 端点按行优先遍历：先依次取入口，对每个入口计算一次可达区域，
 * 再依次取避难点；返回遇到的第一个不可达入口—避难点对。
 * 全部可达时返回 null。
 */
export function validateGrid(grid: Grid): ValidationFailure | null {
  const entrances = findCells(grid, 'entrance');
  const shelters = findCells(grid, 'shelter');

  for (const entrance of entrances) {
    const reachableKeys = reachableFrom(grid, entrance);
    for (const shelter of shelters) {
      if (reachableKeys.has(cellKey(shelter.row, shelter.col))) continue;
      const reachable = [...reachableKeys]
        .map(keyToCell)
        .sort(compareRowMajor);
      return {
        entrance,
        shelter,
        reachable,
        blockingObstacles: findBlockingObstacles(grid, reachableKeys),
      };
    }
  }

  return null;
}

/** 统计各类格数量。 */
export function countCellTypes(grid: Grid): Record<CellType, number> {
  const counts: Record<CellType, number> = {
    empty: 0,
    obstacle: 0,
    guide: 0,
    entrance: 0,
    shelter: 0,
  };
  for (const row of grid) {
    for (const type of row) {
      counts[type] += 1;
    }
  }
  return counts;
}
