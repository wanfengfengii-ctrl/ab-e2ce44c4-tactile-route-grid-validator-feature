import { describe, expect, it } from 'vitest';
import {
  GRID_SIZE,
  type CellType,
  type Grid,
  validateGrid,
} from '../../src/grid';
import { auditSingleBrickFailure } from '../../src/audit';

/** 用行列简写建网格：字符串每行 12 个字符。 */
function gridFromRows(rows: string[]): Grid {
  const glyph: Record<string, CellType> = {
    '.': 'empty',
    '#': 'obstacle',
    'G': 'guide',
    'E': 'entrance',
    'S': 'shelter',
  };
  if (rows.length !== GRID_SIZE) {
    throw new Error(`测试数据必须为 ${GRID_SIZE} 行，实际 ${rows.length} 行`);
  }
  return rows.map((line) => {
    if (line.length !== GRID_SIZE) {
      throw new Error(`测试行必须为 ${GRID_SIZE} 列：${JSON.stringify(line)}`);
    }
    return [...line].map((ch) => {
      const type = glyph[ch];
      if (!type) throw new Error(`测试数据含未知字符 ${JSON.stringify(ch)}`);
      return type;
    });
  });
}

const ALL_EMPTY = (): string[] =>
  Array.from({ length: GRID_SIZE }, () => '.'.repeat(GRID_SIZE));

function set(rows: string[], r: number, c: number, ch: string): string[] {
  const copy = [...rows];
  copy[r] = copy[r].slice(0, c) + ch + copy[r].slice(c + 1);
  return copy;
}

describe('含环路的图：冗余路径吸收单砖失效', () => {
  it('四边成环时没有任何关键砖', () => {
    // 全部端点都在同一个环上，移除任意一块导向砖仍可绕行。
    const grid = gridFromRows([
      'EGGGS.......',
      'G...G.......',
      'SGGGE.......',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ]);

    expect(validateGrid(grid)).toBeNull();
    const audit = auditSingleBrickFailure(grid);
    expect(audit.criticalBricks).toEqual([]);
  });

  it('只切下纯导向砖分支的割点不算关键砖', () => {
    // 入口、避难点与两块导向砖成环；(0,2)(0,3) 是挂在环上的纯导向砖尾巴，
    // (0,1)、(0,2) 虽是图论割点，但移除它们不影响任何入口—避难点关系。
    const grid = gridFromRows([
      'EGGG........',
      'SG..........',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ]);

    expect(validateGrid(grid)).toBeNull();
    expect(auditSingleBrickFailure(grid).criticalBricks).toEqual([]);
  });

  it('孤立的纯导向砖连通分量不产生关键砖', () => {
    // 主分量是 E-G / S-G 四环（无关键砖）；
    // (5,5) 是孤立导向砖链的割点，但分量里没有任何端点。
    const grid = gridFromRows([
      'EG..........',
      'SG..........',
      '............',
      '............',
      '............',
      '....GGG.....',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ]);

    expect(validateGrid(grid)).toBeNull();
    expect(auditSingleBrickFailure(grid).criticalBricks).toEqual([]);
  });
});

describe('链式割点：链上每块导向砖都是关键砖', () => {
  it('E-G-G-S 直链的两块砖各自断开同一对关系', () => {
    const grid = gridFromRows([
      'EGGS........',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ]);

    expect(validateGrid(grid)).toBeNull();
    const audit = auditSingleBrickFailure(grid);
    expect(audit.criticalBricks).toEqual([
      {
        brick: { row: 0, col: 1 },
        brokenPairs: [
          { entrance: { row: 0, col: 0 }, shelter: { row: 0, col: 3 } },
        ],
      },
      {
        brick: { row: 0, col: 2 },
        brokenPairs: [
          { entrance: { row: 0, col: 0 }, shelter: { row: 0, col: 3 } },
        ],
      },
    ]);
  });

  it('长链中间三块砖全部关键，且按行优先排列', () => {
    let rows = ALL_EMPTY();
    rows = set(rows, 4, 2, 'E');
    rows = set(rows, 4, 3, 'G');
    rows = set(rows, 4, 4, 'G');
    rows = set(rows, 4, 5, 'G');
    rows = set(rows, 4, 6, 'S');
    const grid = gridFromRows(rows);

    const audit = auditSingleBrickFailure(grid);
    expect(audit.criticalBricks.map((b) => b.brick)).toEqual([
      { row: 4, col: 3 },
      { row: 4, col: 4 },
      { row: 4, col: 5 },
    ]);
    for (const brick of audit.criticalBricks) {
      expect(brick.brokenPairs).toEqual([
        { entrance: { row: 4, col: 2 }, shelter: { row: 4, col: 6 } },
      ]);
    }
  });
});

describe('多入口多避难点共用割点', () => {
  it('星形中心砖断开全部 2×2 入口—避难点组合', () => {
    //      E(0,1)
    // E(1,0) G(1,1) S(1,2)
    //      S(2,1)
    const grid = gridFromRows([
      '.E..........',
      'EGS.........',
      '.S..........',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ]);

    expect(validateGrid(grid)).toBeNull();
    const audit = auditSingleBrickFailure(grid);
    expect(audit.criticalBricks).toHaveLength(1);
    expect(audit.criticalBricks[0].brick).toEqual({ row: 1, col: 1 });
    // 完整关系集合：按入口行优先、再按避难点行优先，每对只出现一次。
    expect(audit.criticalBricks[0].brokenPairs).toEqual([
      { entrance: { row: 0, col: 1 }, shelter: { row: 1, col: 2 } },
      { entrance: { row: 0, col: 1 }, shelter: { row: 2, col: 1 } },
      { entrance: { row: 1, col: 0 }, shelter: { row: 1, col: 2 } },
      { entrance: { row: 1, col: 0 }, shelter: { row: 2, col: 1 } },
    ]);
  });

  it('割点同侧的多个入口分别列出受影响关系', () => {
    // E(0,0) 与 E(1,0) 相邻互连，G(1,1) 是通往 S(1,2) 的唯一通道。
    // E(1,0) 本身也是图论割点，但入口不可移除，不得列入关键砖。
    const grid = gridFromRows([
      'E...........',
      'EGS.........',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ]);

    expect(validateGrid(grid)).toBeNull();
    const audit = auditSingleBrickFailure(grid);
    expect(audit.criticalBricks).toEqual([
      {
        brick: { row: 1, col: 1 },
        brokenPairs: [
          { entrance: { row: 0, col: 0 }, shelter: { row: 1, col: 2 } },
          { entrance: { row: 1, col: 0 }, shelter: { row: 1, col: 2 } },
        ],
      },
    ]);
  });
});

describe('分支结构：不同关键砖断开不同关系集合', () => {
  it('Y 形结构上每块关键砖的断开对各不相同且完整', () => {
    //          S(0,2)
    //          G(1,2)
    // E(2,0) G(2,1) G(2,2) G(2,3) S(2,4)
    const grid = gridFromRows([
      '..S.........',
      '..G.........',
      'EGGGS.......',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ]);

    expect(validateGrid(grid)).toBeNull();
    const audit = auditSingleBrickFailure(grid);

    // 关键砖按行优先：(1,2) 在 (2,1) 之前。
    expect(audit.criticalBricks.map((b) => b.brick)).toEqual([
      { row: 1, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
    ]);

    const byBrick = new Map(
      audit.criticalBricks.map((b) => [`${b.brick.row},${b.brick.col}`, b]),
    );
    // 支路砖 (1,2)：只断开入口 → 上方避难点。
    expect(byBrick.get('1,2')?.brokenPairs).toEqual([
      { entrance: { row: 2, col: 0 }, shelter: { row: 0, col: 2 } },
    ]);
    // 入口侧砖 (2,1)：入口被孤立，断开全部两对（按避难点行优先）。
    expect(byBrick.get('2,1')?.brokenPairs).toEqual([
      { entrance: { row: 2, col: 0 }, shelter: { row: 0, col: 2 } },
      { entrance: { row: 2, col: 0 }, shelter: { row: 2, col: 4 } },
    ]);
    // 分叉砖 (2,2)：入口侧与两个避难点侧分离。
    expect(byBrick.get('2,2')?.brokenPairs).toEqual([
      { entrance: { row: 2, col: 0 }, shelter: { row: 0, col: 2 } },
      { entrance: { row: 2, col: 0 }, shelter: { row: 2, col: 4 } },
    ]);
    // 右侧砖 (2,3)：只断开入口 → 右端避难点。
    expect(byBrick.get('2,3')?.brokenPairs).toEqual([
      { entrance: { row: 2, col: 0 }, shelter: { row: 2, col: 4 } },
    ]);
  });

  it('双入口各经共用割点通往双避难点时关系完整且无重复', () => {
    // E(0,0) G(0,1)
    //        G(1,1) G(1,2) S(1,3)   ← (1,1) 为共用割点
    // E(2,0) G(2,1)
    //        S(3,1)                 ← 经 (2,1) 挂在割点下方
    let rows = ALL_EMPTY();
    rows = set(rows, 0, 0, 'E');
    rows = set(rows, 0, 1, 'G');
    rows = set(rows, 1, 1, 'G'); // 共用割点
    rows = set(rows, 1, 2, 'G');
    rows = set(rows, 1, 3, 'S');
    rows = set(rows, 2, 0, 'E');
    rows = set(rows, 2, 1, 'G');
    rows = set(rows, 3, 1, 'S'); // 经 (2,1) 挂在割点下方
    const grid = gridFromRows(rows);

    expect(validateGrid(grid)).toBeNull();
    const audit = auditSingleBrickFailure(grid);

    // (1,1) 移除后：{E(0,0),G(0,1)} | {G(1,2),S(1,3)} | {E(2,0),G(2,1),S(3,1)}
    // 断开对：E(0,0)→S(1,3)、E(0,0)→S(3,1)、E(2,0)→S(1,3)。
    const shared = audit.criticalBricks.find(
      (b) => b.brick.row === 1 && b.brick.col === 1,
    );
    expect(shared?.brokenPairs).toEqual([
      { entrance: { row: 0, col: 0 }, shelter: { row: 1, col: 3 } },
      { entrance: { row: 0, col: 0 }, shelter: { row: 3, col: 1 } },
      { entrance: { row: 2, col: 0 }, shelter: { row: 1, col: 3 } },
    ]);

    // (2,1) 移除后：{E(2,0)} | {S(3,1)} | 主干 → E(2,0) 与 S(3,1) 各自
    // 与其他所有端点断开。
    const lower = audit.criticalBricks.find(
      (b) => b.brick.row === 2 && b.brick.col === 1,
    );
    expect(lower?.brokenPairs).toEqual([
      { entrance: { row: 0, col: 0 }, shelter: { row: 3, col: 1 } },
      { entrance: { row: 2, col: 0 }, shelter: { row: 1, col: 3 } },
      { entrance: { row: 2, col: 0 }, shelter: { row: 3, col: 1 } },
    ]);

    // 每块砖内部不应出现重复关系。
    for (const brick of audit.criticalBricks) {
      const keys = brick.brokenPairs.map(
        (p) =>
          `${p.entrance.row},${p.entrance.col}->${p.shelter.row},${p.shelter.col}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
