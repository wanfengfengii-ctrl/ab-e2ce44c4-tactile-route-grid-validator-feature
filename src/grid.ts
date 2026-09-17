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

/**
 * 单砖失效审计中的一条受影响关系：
 * 关键砖被移除后，该入口将无法到达该避难点。
 */
export interface CriticalPair {
  entrance: Cell;
  shelter: Cell;
}

/**
 * 一块关键导向砖（导向砖子图中的割点），以及移除它后断开的
 * 全部入口—避难点对（同一关系只出现一次，按入口行优先、
 * 再按避难点行优先排列）。
 */
export interface CriticalGuide {
  /** 关键导向砖的位置。 */
  brick: Cell;
  pairs: CriticalPair[];
}

/** 单砖失效审计结果。 */
export interface FailureAudit {
  /** 全部关键砖，按行优先排列；为空表示可承受任一单砖失效。 */
  criticalGuides: CriticalGuide[];
}

/**
 * 单砖失效审计：在“入口—导向砖—避难点”组成的正交无向图上，
 * 只把导向砖当作可移除顶点，用一次低链值（low-link）遍历求出
 * 全部关键砖及其移除后断开的入口—避难点对。
 *
 * 不逐砖复制网格、也不重复执行完整可达搜索：整图只遍历一次，
 * 每个 DFS 树根按其 DFS 子树切分，非根顶点按“分离出的子树 +
 * 剩余部分”切分，配合每棵子树内的端点位图与总数在 O(V+E) 内
 * 汇总全部受影响关系。
 *
 * 前提：调用方需保证全连通校验通过且端点数量合法
 * （每个入口本就能到达每个避难点）。
 */
export function auditSingleBrickFailure(grid: Grid): FailureAudit {
  const entrances = findCells(grid, 'entrance');
  const shelters = findCells(grid, 'shelter');
  const totalEntrances = entrances.length;
  const totalShelters = shelters.length;

  // 端点在序列中的序号 → 位图中的位。
  const entranceBit = new Map<number, number>();
  const shelterBit = new Map<number, number>();
  entrances.forEach(({ row, col }, index) =>
    entranceBit.set(cellKey(row, col), index),
  );
  shelters.forEach(({ row, col }, index) =>
    shelterBit.set(cellKey(row, col), index),
  );

  // 只收集可通行顶点，key 即顶点编号（0..143）。
  const vertices: number[] = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (isWalkable(grid[row][col])) vertices.push(cellKey(row, col));
    }
  }

  const N = GRID_SIZE * GRID_SIZE;
  const disc = new Int32Array(N).fill(-1);
  const low = new Int32Array(N);
  const parent = new Int32Array(N).fill(-1);
  // subtreeEntranceMask[v] / subtreeShelterMask[v]：
  // v 的 DFS 子树（含 v 自身）内的端点位图。
  const subtreeEntranceMask = new Uint8Array(N);
  const subtreeShelterMask = new Uint8Array(N);

  // 为分离出的 DFS 子树记录子树内的端点位图。
  interface SeparatedPart {
    eMask: number;
    sMask: number;
  }
  // 每个顶点至多是关键砖候选，割点子树数量很少，用数组分桶即可。
  const separated: SeparatedPart[][] = Array.from({ length: N }, () => []);

  let timer = 0;

  // 迭代式 Tarjan 框架：frame 表示一次“正在访问 u 的某个邻居”的过程。
  interface Frame {
    u: number;
    neighborIndex: number;
  }

  for (const root of vertices) {
    if (disc[root] !== -1) continue;

    disc[root] = low[root] = timer++;
    subtreeEntranceMask[root] = entranceBit.has(root)
      ? 1 << (entranceBit.get(root) as number)
      : 0;
    subtreeShelterMask[root] = shelterBit.has(root)
      ? 1 << (shelterBit.get(root) as number)
      : 0;

    const stack: Frame[] = [{ u: root, neighborIndex: 0 }];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const { u } = frame;
      const { row, col } = keyToCell(u);

      if (frame.neighborIndex < ORTHOGONAL_DELTAS.length) {
        const [dr, dc] = ORTHOGONAL_DELTAS[frame.neighborIndex];
        frame.neighborIndex += 1;
        const nr = row + dr;
        const nc = col + dc;
        if (!isInside(nr, nc) || !isWalkable(grid[nr][nc])) continue;
        const w = cellKey(nr, nc);

        if (disc[w] === -1) {
          parent[w] = u;
          disc[w] = low[w] = timer++;
          subtreeEntranceMask[w] = entranceBit.has(w)
            ? 1 << (entranceBit.get(w) as number)
            : 0;
          subtreeShelterMask[w] = shelterBit.has(w)
            ? 1 << (shelterBit.get(w) as number)
            : 0;
          stack.push({ u: w, neighborIndex: 0 });
        } else if (w !== parent[u]) {
          // 回到祖先的回边（无向图中 w 为后代时 disc[w] > disc[u]，
          // 取最小值不影响 low[u]）。
          low[u] = Math.min(low[u], disc[w]);
        }
        continue;
      }

      // u 的邻居已全部处理完：弹出并向父节点收尾。
      stack.pop();
      const p = parent[u];
      if (p !== -1) {
        low[p] = Math.min(low[p], low[u]);
        subtreeEntranceMask[p] |= subtreeEntranceMask[u];
        subtreeShelterMask[p] |= subtreeShelterMask[u];
        // 非根判定：low[u] >= disc[p] 时移除 p 会把 u 的子树分离出来。
        if (low[u] >= disc[p]) {
          separated[p].push({
            eMask: subtreeEntranceMask[u],
            sMask: subtreeShelterMask[u],
          });
        }
      }
    }
  }

  const allEntranceMask =
    totalEntrances === 0 ? 0 : (1 << totalEntrances) - 1;
  const allShelterMask = totalShelters === 0 ? 0 : (1 << totalShelters) - 1;

  // 行优先遍历顶点，天然得到关键砖的行优先顺序。
  const criticalGuides: CriticalGuide[] = [];
  for (const u of vertices) {
    if (grid[keyToCell(u).row][keyToCell(u).col] !== 'guide') continue;

    const isRoot = parent[u] === -1;
    const children = separated[u];
    // 根节点：拥有 ≥2 棵 DFS 子树才是割点；非根：存在分离子树即是割点。
    if (isRoot ? children.length < 2 : children.length === 0) continue;

    // 每一块被分离的部分中的端点，与其他部分的端点之间的关系都会断开。
    const parts: SeparatedPart[] = children.map((part) => ({ ...part }));
    if (!isRoot) {
      // 非根：父方向的“剩余部分”也要作为一块。移除 u 后，
      // 未分离的 DFS 子树可经回边接到父方向，因此剩余部分恰为
      // 全部端点减去 u 自身与各分离子树中的端点。
      let sepEMask = 0;
      let sepSMask = 0;
      for (const part of children) {
        sepEMask |= part.eMask;
        sepSMask |= part.sMask;
      }
      const selfEMask = entranceBit.has(u)
        ? 1 << (entranceBit.get(u) as number)
        : 0;
      const selfSMask = shelterBit.has(u)
        ? 1 << (shelterBit.get(u) as number)
        : 0;
      parts.push({
        eMask: allEntranceMask & ~(sepEMask | selfEMask),
        sMask: allShelterMask & ~(sepSMask | selfSMask),
      });
    }

    // 汇总跨部分的入口—避难点对：以入口侧为基准，
    // 该入口所在部分之外的全部避难点都会失联。
    const affectedShelterByEntrance = new Map<number, number>();
    for (const { eMask, sMask } of parts) {
      let eBits = eMask;
      while (eBits !== 0) {
        const bit = eBits & -eBits;
        eBits ^= bit;
        const entranceIndex = 31 - Math.clz32(bit);
        const outside = allShelterMask ^ sMask;
        affectedShelterByEntrance.set(
          entranceIndex,
          (affectedShelterByEntrance.get(entranceIndex) ?? 0) | outside,
        );
      }
    }

    const pairs: CriticalPair[] = [];
    // entrances / shelters 本身按行优先，位图展开后即行优先顺序。
    for (let ei = 0; ei < totalEntrances; ei += 1) {
      const shelterBits = affectedShelterByEntrance.get(ei) ?? 0;
      if (shelterBits === 0) continue;
      for (let si = 0; si < totalShelters; si += 1) {
        if ((shelterBits & (1 << si)) !== 0) {
          pairs.push({
            entrance: { ...entrances[ei] },
            shelter: { ...shelters[si] },
          });
        }
      }
    }

    if (pairs.length > 0) {
      criticalGuides.push({ brick: keyToCell(u), pairs });
    }
  }

  return { criticalGuides };
}
