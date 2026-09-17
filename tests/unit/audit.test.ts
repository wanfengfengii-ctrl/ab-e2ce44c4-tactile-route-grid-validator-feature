import { describe, expect, it } from 'vitest';
import {
  GRID_SIZE,
  type CellType,
  type Grid,
  auditSingleBrickFailure,
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

/** 把关键砖结果压成 (砖) -> ['r,c->r,c'] 的完整关系集合，便于断言。 */
function relationMap(result: ReturnType<typeof auditSingleBrickFailure>) {
  const map = new Map<string, string[]>();
  for (const { brick, pairs } of result.criticalGuides) {
    map.set(
      `${brick.row},${brick.col}`,
      pairs.map(
        ({ entrance, shelter }) =>
          `${entrance.row},${entrance.col}->${shelter.row},${shelter.col}`,
      ),
    );
  }
  return map;
}

describe('单砖失效审计：含环路的网络可承受任一单砖失效', () => {
  it('导向砖环上 2 入口 2 避难点：没有关键砖', () => {
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

    const result = auditSingleBrickFailure(grid);
    expect(result.criticalGuides).toEqual([]);
  });

  it('环上挂一片无端点的导向砖“尾巴”：尾巴砖不关键，环砖也不关键', () => {
    // 4 格小环：(5,5)-(5,6)-(6,6)-(6,5)，在 (6,5) 上接一条无端点尾巴
    let rows = ALL_EMPTY();
    rows = set(rows, 5, 5, 'E');
    rows = set(rows, 5, 6, 'G');
    rows = set(rows, 6, 6, 'G');
    rows = set(rows, 6, 5, 'S');
    rows = set(rows, 7, 5, 'G'); // 尾巴：与 (6,5) 避难点相连的死胡同
    rows = set(rows, 8, 5, 'G');
    const grid = gridFromRows(rows);
    expect(validateGrid(grid)).toBeNull();

    // 移除任意一块导向砖，入口仍能到达避难点（环不被单砖切断，
    // 死胡同砖本就不在任何入口—避难点必经路径上）。
    const result = auditSingleBrickFailure(grid);
    expect(result.criticalGuides).toEqual([]);
  });
});

describe('单砖失效审计：链式割点', () => {
  it('E-G-G-S 直链：两块导向砖都是关键砖，均断开唯一的入口—避难点对', () => {
    let rows = ALL_EMPTY();
    rows = set(rows, 0, 0, 'E');
    rows = set(rows, 0, 1, 'G');
    rows = set(rows, 0, 2, 'G');
    rows = set(rows, 0, 3, 'S');
    const grid = gridFromRows(rows);
    expect(validateGrid(grid)).toBeNull();

    const result = auditSingleBrickFailure(grid);
    const map = relationMap(result);
    expect([...map.keys()]).toEqual(['0,1', '0,2']); // 关键砖行优先
    expect(map.get('0,1')).toEqual(['0,0->0,3']);
    expect(map.get('0,2')).toEqual(['0,0->0,3']);
  });

  it('含环主体 + 链式挂出的避难点：环砖不关键，链上每块砖（含挂点）都关键', () => {
    // 8 格环（两行入口落在环上），在环顶点 (3,3) 处经
    // (3,4)G-(3,5)G 链接到避难点 (3,6)。
    let rows = ALL_EMPTY();
    rows = set(rows, 1, 1, 'G');
    rows = set(rows, 1, 2, 'E'); // 环上的入口 1
    rows = set(rows, 1, 3, 'G');
    rows = set(rows, 2, 1, 'G');
    rows = set(rows, 2, 3, 'G');
    rows = set(rows, 3, 1, 'G');
    rows = set(rows, 3, 2, 'E'); // 环上的入口 2
    rows = set(rows, 3, 3, 'G'); // 挂点：也是割点
    rows = set(rows, 3, 4, 'G');
    rows = set(rows, 3, 5, 'G');
    rows = set(rows, 3, 6, 'S');
    const grid = gridFromRows(rows);
    expect(validateGrid(grid)).toBeNull();

    const result = auditSingleBrickFailure(grid);
    const map = relationMap(result);
    // 环上除挂点外的砖都不关键；关键砖按行优先：(3,3),(3,4),(3,5)
    expect([...map.keys()]).toEqual(['3,3', '3,4', '3,5']);
    // 每块砖断开的关系一致：两个入口都到不了避难点，
    // 关系按入口行优先排列且只出现一次。
    for (const pairs of map.values()) {
      expect(pairs).toEqual(['1,2->3,6', '3,2->3,6']);
    }
  });
});

describe('单砖失效审计：多入口多避难点共用割点', () => {
  it('十字星形：2 入口 2 避难点共用中心关键砖，完整关系集合为笛卡尔积', () => {
    let rows = ALL_EMPTY();
    rows = set(rows, 1, 2, 'E'); // 中心正上
    rows = set(rows, 2, 1, 'E'); // 中心正左
    rows = set(rows, 2, 2, 'G'); // 唯一导向砖：共用割点
    rows = set(rows, 3, 2, 'S'); // 中心正下
    rows = set(rows, 2, 3, 'S'); // 中心正右
    const grid = gridFromRows(rows);
    expect(validateGrid(grid)).toBeNull();

    const result = auditSingleBrickFailure(grid);
    const map = relationMap(result);
    expect([...map.keys()]).toEqual(['2,2']);
    // 四个端点彼此只在角点相碰（不连通），中心砖失效后全部分离：
    // 关系按入口行优先、再按避难点行优先排列。
    expect(map.get('2,2')).toEqual([
      '1,2->2,3', // E(1,2) -> S(2,3)：避难点 (2,3) 行优先在前
      '1,2->3,2',
      '2,1->2,3',
      '2,1->3,2',
    ]);
  });

  it('割点两侧各自成环、各有 2 入口 / 2 避难点：仅中心砖关键，跨侧 4 对全断开', () => {
    //       (2,2)E — (2,3)E
    //          |  ╲  ╱  |
    //        (3,2)G—(3,3)G[C]—(3,4)G
    //                   |  ╲  ╱  |
    //                 (4,3)S — (4,4)S
    // 左 4 环：C-(2,3)-(2,2)-(3,2)-C（2 个入口）
    // 右 4 环：C-(4,3)-(4,4)-(3,4)-C（2 个避难点）
    // 除 C 外任一块砖损坏，两侧仍可经环上的另一条邻边接上 C。
    let rows = ALL_EMPTY();
    rows = set(rows, 3, 3, 'G'); // 中心唯一关键砖 C
    rows = set(rows, 2, 3, 'E');
    rows = set(rows, 2, 2, 'E');
    rows = set(rows, 3, 2, 'G');
    rows = set(rows, 4, 3, 'S');
    rows = set(rows, 4, 4, 'S');
    rows = set(rows, 3, 4, 'G');
    const grid = gridFromRows(rows);
    expect(validateGrid(grid)).toBeNull();

    const result = auditSingleBrickFailure(grid);
    expect(result.criticalGuides).toHaveLength(1);
    const { brick, pairs } = result.criticalGuides[0];
    expect(brick).toEqual({ row: 3, col: 3 });
    // 入口行优先：(2,2) 先于 (2,3)；避难点行优先：(4,3) 先于 (4,4)。
    expect(pairs).toEqual([
      { entrance: { row: 2, col: 2 }, shelter: { row: 4, col: 3 } },
      { entrance: { row: 2, col: 2 }, shelter: { row: 4, col: 4 } },
      { entrance: { row: 2, col: 3 }, shelter: { row: 4, col: 3 } },
      { entrance: { row: 2, col: 3 }, shelter: { row: 4, col: 4 } },
    ]);
    // 同一关系只出现一次。
    const keys = pairs.map(
      (p) =>
        `${p.entrance.row},${p.entrance.col}->${p.shelter.row},${p.shelter.col}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('单砖失效审计：关键砖行优先排列', () => {
  it('两条独立直链上的割点按行列顺序输出，且各自关系互不串扰', () => {
    let rows = ALL_EMPTY();
    // 链 A（第 2 行）：E(2,0)-G(2,1)-S(2,2)
    rows = set(rows, 2, 0, 'E');
    rows = set(rows, 2, 1, 'G');
    rows = set(rows, 2, 2, 'S');
    // 链 B（第 5 行）：E(5,8)-G(5,9)-S(5,10)
    rows = set(rows, 5, 8, 'E');
    rows = set(rows, 5, 9, 'G');
    rows = set(rows, 5, 10, 'S');
    // 两条链分属不同连通分量，先把它们接成同一分量（保持各割点
    // 只影响自己链上的端点对），再对完整图启动审计。
    rows = set(rows, 2, 5, 'G');
    rows = set(rows, 3, 5, 'G');
    rows = set(rows, 4, 5, 'G');
    rows = set(rows, 5, 5, 'G');
    rows = set(rows, 5, 6, 'G');
    rows = set(rows, 5, 7, 'G');
    // (2,5) 到 (2,2) 之间沿第 2 行补齐
    rows = set(rows, 2, 3, 'G');
    rows = set(rows, 2, 4, 'G');
    const connectedGrid = gridFromRows(rows);
    expect(validateGrid(connectedGrid)).toBeNull();

    const result = auditSingleBrickFailure(connectedGrid);
    const bricks = result.criticalGuides.map(({ brick }) => brick);
    // 行优先：第 2 行各砖在前，(5,9) 在最后。
    expect(bricks).toContainEqual({ row: 2, col: 1 });
    expect(bricks).toContainEqual({ row: 5, col: 9 });
    expect(bricks).toEqual([...bricks].sort((a, b) => a.row - b.row || a.col - b.col));

    const a = result.criticalGuides.find(
      ({ brick }) => brick.row === 2 && brick.col === 1,
    );
    const b = result.criticalGuides.find(
      ({ brick }) => brick.row === 5 && brick.col === 9,
    );
    expect(a?.pairs).toEqual([
      { entrance: { row: 2, col: 0 }, shelter: { row: 2, col: 2 } },
      { entrance: { row: 2, col: 0 }, shelter: { row: 5, col: 10 } },
    ]);
    expect(b?.pairs).toEqual([
      { entrance: { row: 2, col: 0 }, shelter: { row: 5, col: 10 } },
      { entrance: { row: 5, col: 8 }, shelter: { row: 5, col: 10 } },
    ]);
  });
});
