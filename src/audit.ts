/**
 * 单砖失效审计：在已通过全连通校验的网格上，找出全部“关键导向砖”——
 * 移除它之后，至少有一对入口—避难点不再连通。
 *
 * 模型：入口(entrance)、导向砖(guide)、避难点(shelter) 组成正交无向图
 * （仅共享边的可通行格之间连边），只有导向砖是可移除顶点。
 *
 * 方法：对整张图只做一次 DFS 低链值（low-link）遍历，得到每个顶点的
 * 发现序号 disc、低链值 low 与 DFS 树。顶点 v 是割点当且仅当：
 *   - v 是 DFS 根且孩子数 ≥ 2；或
 *   - v 非根且存在孩子 c 满足 low[c] ≥ disc[v]。
 * 移除割点 v 后，其所在连通分量被拆成若干部分：每个满足
 * low[c] ≥ disc[v] 的孩子子树各成一部分，非根时“其余部分”
 * （v 子树之外、经回边连向祖先的顶点）也是一部分。
 * 位于不同部分的入口—避难点对，即为移除 v 后断开的关系。
 *
 * 全程不复制网格、不逐砖重跑可达搜索；端点最多 4+4 个，
 * 分组与配对的开销可忽略。
 */

import {
  GRID_SIZE,
  type Cell,
  type Grid,
  cellKey,
  compareRowMajor,
  findCells,
  isWalkable,
} from './grid';

/** 移除某块关键砖后断开的一对入口—避难点。 */
export interface BrokenPair {
  entrance: Cell;
  shelter: Cell;
}

/** 一块关键导向砖及其移除后断开的全部入口—避难点对。 */
export interface CriticalBrick {
  /** 被移除的导向砖位置。 */
  brick: Cell;
  /** 断开的入口—避难点对：按入口行优先、再按避难点行优先排序。 */
  brokenPairs: BrokenPair[];
}

/** 单砖失效审计结果。 */
export interface SingleBrickAudit {
  /** 全部关键砖，按行优先排序；为空表示网络可承受任一单砖失效。 */
  criticalBricks: CriticalBrick[];
}

/** 四正方向邻居；与连通校验一致，故意不含对角方向。 */
const ORTHOGONAL_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * 对当前网格执行单砖失效审计。
 *
 * 预期在全连通校验通过、端点数量合法后调用；对不满足前提的网格
 * 同样安全（只报告“移除某砖后新断开”的关系，本就断开的对不计入）。
 */
export function auditSingleBrickFailure(grid: Grid): SingleBrickAudit {
  const size = GRID_SIZE * GRID_SIZE;

  // 邻接表：仅入口 / 导向砖 / 避难点参与构图，空白与障碍不是顶点。
  const walkable = new Uint8Array(size);
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (isWalkable(grid[row][col])) {
        walkable[cellKey(row, col)] = 1;
      }
    }
  }
  const neighbors: number[][] = Array.from({ length: size }, () => []);
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const key = cellKey(row, col);
      if (!walkable[key]) continue;
      for (const [dr, dc] of ORTHOGONAL_DELTAS) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
        const nKey = cellKey(nr, nc);
        if (walkable[nKey]) neighbors[key].push(nKey);
      }
    }
  }

  // 一次迭代式 DFS（可能跨越多个连通分量），求 disc / low / DFS 树。
  const disc = new Int32Array(size).fill(-1);
  const low = new Int32Array(size);
  const parent = new Int32Array(size).fill(-1);
  // subtreeEnd[v]：v 的 DFS 子树中最大的 disc。先序编号保证
  // “u 在 v 的子树内” ⟺ disc[v] ≤ disc[u] ≤ subtreeEnd[v]。
  const subtreeEnd = new Int32Array(size);
  // component[v]：v 所在连通分量的 DFS 根，用于区分不同分量。
  const component = new Int32Array(size).fill(-1);
  const children: number[][] = Array.from({ length: size }, () => []);

  let time = 0;
  for (let start = 0; start < size; start += 1) {
    if (!walkable[start] || disc[start] !== -1) continue;
    disc[start] = time;
    low[start] = time;
    component[start] = start;
    time += 1;
    const stack: Array<{ v: number; next: number }> = [{ v: start, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const v = frame.v;
      if (frame.next < neighbors[v].length) {
        const w = neighbors[v][frame.next];
        frame.next += 1;
        if (disc[w] === -1) {
          parent[w] = v;
          component[w] = component[v];
          children[v].push(w);
          disc[w] = time;
          low[w] = time;
          time += 1;
          stack.push({ v: w, next: 0 });
        } else if (w !== parent[v] && disc[w] < low[v]) {
          low[v] = disc[w]; // 回边：用祖先的发现序号压低 low
        }
      } else {
        stack.pop();
        subtreeEnd[v] = time - 1;
        const p = parent[v];
        if (p !== -1 && low[v] < low[p]) low[p] = low[v];
      }
    }
  }

  // 端点（入口与避难点）是审计关心的全部关系两端。
  interface Endpoint {
    key: number;
    cell: Cell;
    kind: 'entrance' | 'shelter';
  }
  const endpoints: Endpoint[] = [
    ...findCells(grid, 'entrance').map(
      (cell): Endpoint => ({
        key: cellKey(cell.row, cell.col),
        cell,
        kind: 'entrance',
      }),
    ),
    ...findCells(grid, 'shelter').map(
      (cell): Endpoint => ({
        key: cellKey(cell.row, cell.col),
        cell,
        kind: 'shelter',
      }),
    ),
  ];

  const criticalBricks: CriticalBrick[] = [];

  // 按行优先遍历格子，仅导向砖可作为可移除顶点。
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (grid[row][col] !== 'guide') continue;
      const v = cellKey(row, col);

      // 移除 v 后被切出的“分离子树”：孩子 c 满足 low[c] ≥ disc[v]。
      const separated = children[v].filter((c) => low[c] >= disc[v]);
      const isRoot = parent[v] === -1;
      // 割点判定：根需 ≥2 个分离子树；非根需 ≥1 个（其余部分必然非空）。
      if (separated.length === 0) continue;
      if (isRoot && separated.length < 2) continue;

      // 分组：每个分离子树一组；非根时外加“其余部分”一组。
      const partCount = separated.length + (isRoot ? 0 : 1);
      const restPart = isRoot ? -1 : separated.length;
      const partEntrances: Cell[][] = Array.from(
        { length: partCount },
        () => [],
      );
      const partShelters: Cell[][] = Array.from(
        { length: partCount },
        () => [],
      );

      for (const endpoint of endpoints) {
        // 只关心与 v 同一连通分量的端点；其他分量不受移除 v 影响。
        if (component[endpoint.key] !== component[v]) continue;
        const d = disc[endpoint.key];
        let part = -1;
        for (let i = 0; i < separated.length; i += 1) {
          const c = separated[i];
          if (d >= disc[c] && d <= subtreeEnd[c]) {
            part = i;
            break;
          }
        }
        if (part === -1) {
          // 不在任何分离子树内：非根时属于“其余部分”；
          // 根的分量中每个顶点必落在某棵孩子子树内，不会走到这里。
          if (restPart === -1) continue;
          part = restPart;
        }
        (endpoint.kind === 'entrance' ? partEntrances : partShelters)[
          part
        ].push(endpoint.cell);
      }

      // 跨组的入口—避难点对即移除 v 后断开的关系；每组端点唯一归属，
      // 同一关系只会生成一次。
      const brokenPairs: BrokenPair[] = [];
      for (let i = 0; i < partCount; i += 1) {
        for (let j = i + 1; j < partCount; j += 1) {
          for (const entrance of partEntrances[i]) {
            for (const shelter of partShelters[j]) {
              brokenPairs.push({ entrance, shelter });
            }
          }
          for (const entrance of partEntrances[j]) {
            for (const shelter of partShelters[i]) {
              brokenPairs.push({ entrance, shelter });
            }
          }
        }
      }

      // 割点若只切下纯导向砖分支，不影响任何端点关系，不算关键砖。
      if (brokenPairs.length === 0) continue;

      brokenPairs.sort(
        (a, b) =>
          compareRowMajor(a.entrance, b.entrance) ||
          compareRowMajor(a.shelter, b.shelter),
      );
      criticalBricks.push({ brick: { row, col }, brokenPairs });
    }
  }

  // 遍历顺序本身即行优先，显式排序以固化输出约定。
  criticalBricks.sort((a, b) => compareRowMajor(a.brick, b.brick));

  return { criticalBricks };
}
