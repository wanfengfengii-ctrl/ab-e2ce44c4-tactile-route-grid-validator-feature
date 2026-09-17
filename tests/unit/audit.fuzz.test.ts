import { describe, expect, it } from 'vitest';
import {
  GRID_SIZE,
  type CellType,
  type Grid,
  auditSingleBrickFailure,
  cellKey,
  isWalkable,
  reachableFrom,
} from '../../src/grid';

/** 暴力对照：逐砖移除后用 BFS 求断开的入口—避难点对（仅测试用）。 */
function bruteForce(grid: Grid) {
  const entrances: { r: number; c: number }[] = [];
  const shelters: { r: number; c: number }[] = [];
  const guides: { r: number; c: number }[] = [];
  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      if (grid[r][c] === 'entrance') entrances.push({ r, c });
      if (grid[r][c] === 'shelter') shelters.push({ r, c });
      if (grid[r][c] === 'guide') guides.push({ r, c });
    }
  }
  const result = new Map<string, string[]>();
  for (const g of guides) {
    const pairs: string[] = [];
    for (const e of entrances) {
      const seen = new Set<number>();
      const queue = [e];
      seen.add(cellKey(e.r, e.c));
      while (queue.length) {
        const cur = queue.shift()!;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const nr = cur.r + dr;
          const nc = cur.c + dc;
          if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
          if (nr === g.r && nc === g.c) continue;
          if (!isWalkable(grid[nr][nc])) continue;
          const k = cellKey(nr, nc);
          if (seen.has(k)) continue;
          seen.add(k);
          queue.push({ r: nr, c: nc });
        }
      }
      for (const s of shelters) {
        if (!seen.has(cellKey(s.r, s.c))) pairs.push(`${e.r},${e.c}->${s.r},${s.c}`);
      }
    }
    if (pairs.length) result.set(`${g.r},${g.c}`, pairs);
  }
  return result;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('随机对照：一次低链值遍历 == 逐砖 BFS', () => {
  it('200 个随机稀疏可通行图（含强制全连通的端点）完整关系集合一致', () => {
    const rand = mulberry32(20260917);
    let tested = 0;
    for (let trial = 0; trial < 400 && tested < 200; trial += 1) {
      const grid: Grid = Array.from({ length: GRID_SIZE }, () =>
        Array<CellType>(GRID_SIZE).fill('empty'),
      );
      // 随机撒可通行格
      for (let r = 0; r < GRID_SIZE; r += 1) {
        for (let c = 0; c < GRID_SIZE; c += 1) {
          const roll = rand();
          if (roll < 0.32) grid[r][c] = 'guide';
          else if (roll < 0.36) grid[r][c] = 'obstacle';
        }
      }
      const walkable: [number, number][] = [];
      for (let r = 0; r < GRID_SIZE; r += 1)
        for (let c = 0; c < GRID_SIZE; c += 1)
          if (grid[r][c] === 'guide') walkable.push([r, c]);
      if (walkable.length < 6) continue;
      // 选 1-4 个入口与 1-4 个避难点
      const shuffled = [...walkable].sort(() => rand() - 0.5);
      const ne = 1 + Math.floor(rand() * 4);
      const ns = 1 + Math.floor(rand() * 4);
      if (shuffled.length < ne + ns) continue;
      for (let i = 0; i < ne; i += 1) {
        const [r, c] = shuffled[i];
        grid[r][c] = 'entrance';
      }
      for (let i = 0; i < ns; i += 1) {
        const [r, c] = shuffled[ne + i];
        grid[r][c] = 'shelter';
      }
      // 强制全连通：从第一个入口 BFS，把每个尚未连通的端点用一条
      // 正交导向砖路径接进主分量。
      const anchor = shuffled[0 + ne + ns] ?? shuffled[0];
      const ensureReachable = (tr: number, tc: number) => {
        const reach = reachableFrom(grid, { row: tr, col: tc });
        if (reach.has(cellKey(anchor[0], anchor[1]))) return;
        // 走到可达区域里离 anchor 最近的格：简单做法——从 anchor 走直线
        // 到 tr/tc，铺成导向砖。
        let r = anchor[0];
        let c = anchor[1];
        while (r !== tr) {
          r += Math.sign(tr - r);
          if (grid[r][c] === 'empty' || grid[r][c] === 'obstacle') grid[r][c] = 'guide';
        }
        while (c !== tc) {
          c += Math.sign(tc - c);
          if (grid[r][c] === 'empty' || grid[r][c] === 'obstacle') grid[r][c] = 'guide';
        }
      };
      for (let i = 0; i < ne; i += 1) ensureReachable(shuffled[i][0], shuffled[i][1]);
      for (let i = 0; i < ns; i += 1) ensureReachable(shuffled[ne + i][0], shuffled[ne + i][1]);

      // 验证全连通前提
      const first = shuffled[0];
      const reach = reachableFrom(grid, { row: first[0], col: first[1] });
      let connected = true;
      for (let i = 0; i < ne + ns; i += 1) {
        if (!reach.has(cellKey(shuffled[i][0], shuffled[i][1]))) connected = false;
      }
      if (!connected) continue;

      const got = auditSingleBrickFailure(grid);
      const gotMap = new Map<string, string[]>();
      for (const { brick, pairs } of got.criticalGuides) {
        gotMap.set(
          `${brick.row},${brick.col}`,
          pairs.map((p) => `${p.entrance.row},${p.entrance.col}->${p.shelter.row},${p.shelter.col}`),
        );
      }
      const expected = bruteForce(grid);
      expect([...gotMap.keys()].sort()).toEqual([...expected.keys()].sort());
      for (const [k, v] of expected) {
        expect(gotMap.get(k)?.slice().sort()).toEqual(v.slice().sort());
      }
      tested += 1;
    }
    expect(tested).toBeGreaterThanOrEqual(100);
  });
});
