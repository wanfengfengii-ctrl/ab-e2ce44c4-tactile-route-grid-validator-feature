import { describe, expect, it } from 'vitest';
import {
  GRID_SIZE,
  type CellType,
  type Grid,
  compareRowMajor,
  findBlockingObstacles,
  findCells,
  reachableFrom,
  validateGrid,
} from '../../src/grid';

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

describe('行优先排序', () => {
  it('findCells 按行优先（先 row 后 col）返回坐标', () => {
    let rows = ALL_EMPTY();
    rows = set(rows, 0, 11, 'E');
    rows = set(rows, 2, 0, 'E');
    rows = set(rows, 2, 9, 'E');
    rows = set(rows, 10, 5, 'E');
    rows = set(rows, 1, 1, 'S'); // 避难点不影响入口顺序

    const grid = gridFromRows(rows);
    expect(findCells(grid, 'entrance')).toEqual([
      { row: 0, col: 11 },
      { row: 2, col: 0 },
      { row: 2, col: 9 },
      { row: 10, col: 5 },
    ]);
  });

  it('compareRowMajor：同行比列，不同行比行', () => {
    expect(compareRowMajor({ row: 0, col: 9 }, { row: 1, col: 0 })).toBeLessThan(0);
    expect(compareRowMajor({ row: 2, col: 8 }, { row: 2, col: 3 })).toBeGreaterThan(0);
    expect(compareRowMajor({ row: 3, col: 3 }, { row: 3, col: 3 })).toBe(0);
  });
});

describe('正交连通：对角相碰不算连接', () => {
  it('入口与避难点仅对角接触时互不可达', () => {
    let rows = ALL_EMPTY();
    rows = set(rows, 1, 1, 'E');
    rows = set(rows, 2, 2, 'S'); // 与入口仅共享角点
    const grid = gridFromRows(rows);

    const reachable = reachableFrom(grid, { row: 1, col: 1 });
    expect([...reachable]).toEqual([1 * GRID_SIZE + 1]);
    expect(validateGrid(grid)).not.toBeNull();
  });

  it('导向砖只在角点相碰形成的“斜向链”不可通行', () => {
    let rows = ALL_EMPTY();
    rows = set(rows, 0, 0, 'E');
    rows = set(rows, 1, 1, 'G');
    rows = set(rows, 2, 2, 'S');
    const grid = gridFromRows(rows);

    const failure = validateGrid(grid);
    expect(failure).not.toBeNull();
    expect(failure?.reachable).toEqual([{ row: 0, col: 0 }]);
  });

  it('补齐一块正交连接的导向砖后整链连通', () => {
    let rows = ALL_EMPTY();
    rows = set(rows, 0, 0, 'E');
    rows = set(rows, 1, 1, 'G');
    rows = set(rows, 2, 2, 'S');

    // 在角点缺口处补一块与上下均共享边的砖
    rows = set(rows, 0, 1, 'G');
    rows = set(rows, 1, 2, 'G');
    const grid = gridFromRows(rows);

    expect(validateGrid(grid)).toBeNull();
  });

  it('绕弯的正交路径可达，障碍不可穿越', () => {
    let rows = ALL_EMPTY();
    rows = set(rows, 0, 0, 'E');
    // 直通路被障碍封死
    rows = set(rows, 0, 1, '#');
    rows = set(rows, 1, 0, 'G');
    rows = set(rows, 2, 0, 'G');
    rows = set(rows, 2, 1, 'G');
    rows = set(rows, 2, 2, 'G');
    rows = set(rows, 1, 2, 'G');
    rows = set(rows, 0, 2, 'S');
    const grid = gridFromRows(rows);

    expect(validateGrid(grid)).toBeNull();
    const reachable = reachableFrom(grid, { row: 0, col: 0 });
    expect(reachable.has(cell(0, 1))).toBe(false); // 障碍不可进入
    expect(reachable.has(cell(2, 1))).toBe(true); // 可绕行
  });

  it('空白格不可通行，不能借空白“跨过”', () => {
    let rows = ALL_EMPTY();
    rows = set(rows, 5, 5, 'E');
    rows = set(rows, 5, 7, 'S');
    rows = set(rows, 5, 6, '.'); // 中间留空
    const grid = gridFromRows(rows);
    expect(validateGrid(grid)).not.toBeNull();
  });
});

function cell(r: number, c: number): number {
  return r * GRID_SIZE + c;
}

describe('validateGrid 的首不可达对选择规则', () => {
  it('先按行优先遍历入口，再按行优先遍历避难点，取首个不可达对', () => {
    // 两个互不相连的正交连通分量：
    //   分量 A：E1(1,1) 只连通 S1(1,3)
    //   分量 B：E2(6,1) 连通 S2(6,9) 与 S3(9,2)
    // 避难点行优先顺序为 S1、S2、S3：E1 对 S1 可达被跳过，
    // 首个不可达对为 E1 → S2。
    let rows = ALL_EMPTY();
    rows = set(rows, 1, 1, 'E'); // E1
    rows = set(rows, 1, 2, 'G');
    rows = set(rows, 1, 3, 'S'); // S1：E1 可达

    rows = set(rows, 6, 1, 'E'); // E2
    for (let c = 2; c <= 8; c += 1) {
      rows = set(rows, 6, c, 'G');
    }
    rows = set(rows, 6, 9, 'S'); // S2：仅 E2 可达
    rows = set(rows, 7, 2, 'G');
    rows = set(rows, 8, 2, 'G');
    rows = set(rows, 9, 2, 'S'); // S3：仅 E2 可达
    const grid = gridFromRows(rows);

    const failure = validateGrid(grid);
    expect(failure).not.toBeNull();
    expect(failure?.entrance).toEqual({ row: 1, col: 1 });
    expect(failure?.shelter).toEqual({ row: 6, col: 9 });
    // 可达区域即分量 A
    expect(failure?.reachable).toEqual([
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ]);
  });

  it('更靠后的入口即使也不可达，也不会抢先于靠前入口', () => {
    let rows = ALL_EMPTY();
    rows = set(rows, 0, 0, 'E'); // 靠前入口，孤立
    rows = set(rows, 8, 8, 'E'); // 靠后入口，同样孤立
    rows = set(rows, 11, 11, 'S');
    rows = set(rows, 3, 3, 'S');
    const grid = gridFromRows(rows);

    const failure = validateGrid(grid);
    expect(failure?.entrance).toEqual({ row: 0, col: 0 });
    // 避难点按行优先：(3,3) 在 (11,11) 前
    expect(failure?.shelter).toEqual({ row: 3, col: 3 });
  });
});

describe('可达区域与相邻障碍', () => {
  it('高亮入口实际可达的全部格，并找出与该区域共享边的障碍', () => {
    let rows = ALL_EMPTY();
    rows = set(rows, 2, 2, 'E');
    rows = set(rows, 2, 3, 'G');
    rows = set(rows, 3, 3, 'G');
    rows = set(rows, 3, 4, 'S');
    // 对角“看似连续”的砖不算连接
    rows = set(rows, 1, 4, 'G');
    rows = set(rows, 1, 5, 'S');
    // 与可达区域共享边的障碍
    rows = set(rows, 2, 4, '#');
    rows = set(rows, 3, 2, '#');
    // 不与可达区域相邻的障碍（无关）
    rows = set(rows, 9, 9, '#');
    const grid = gridFromRows(rows);

    const failure = validateGrid(grid);
    expect(failure).not.toBeNull();
    expect(failure?.shelter).toEqual({ row: 1, col: 5 });
    expect(failure?.reachable).toEqual([
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 3, col: 3 },
      { row: 3, col: 4 },
    ]);
    expect(failure?.blockingObstacles).toEqual([
      { row: 2, col: 4 },
      { row: 3, col: 2 },
    ]);
  });

  it('对角相接的障碍不算“共享边”，不纳入高亮', () => {
    let rows = ALL_EMPTY();
    rows = set(rows, 0, 0, 'E');
    rows = set(rows, 1, 1, '#'); // 仅与入口对角接触
    rows = set(rows, 5, 5, 'S');
    const grid = gridFromRows(rows);

    const reachable = reachableFrom(grid, { row: 0, col: 0 });
    expect(findBlockingObstacles(grid, reachable)).toEqual([]);
    expect(grid[1][1]).toBe('obstacle');
  });
});

describe('全部可达', () => {
  it('多个入口与多个避难点处于同一正交连通分量时通过', () => {
    let rows = ALL_EMPTY();
    rows = set(rows, 0, 0, 'E');
    rows = set(rows, 0, 11, 'E');
    rows = set(rows, 11, 0, 'S');
    rows = set(rows, 11, 11, 'S');
    // 沿四边铺导向砖形成环
    for (let c = 1; c < 11; c += 1) {
      rows = set(rows, 0, c, 'G');
      rows = set(rows, 11, c, 'G');
    }
    for (let r = 1; r < 11; r += 1) {
      rows = set(rows, r, 0, 'G');
      rows = set(rows, r, 11, 'G');
    }
    const grid = gridFromRows(rows);
    expect(validateGrid(grid)).toBeNull();
  });
});
