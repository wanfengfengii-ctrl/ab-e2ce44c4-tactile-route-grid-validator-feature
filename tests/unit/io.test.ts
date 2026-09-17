import { describe, expect, it } from 'vitest';
import {
  FORMAT_VERSION,
  GridImportError,
  gridToJson,
  parseGridData,
  parseGridJson,
} from '../../src/io';
import { GRID_SIZE, createEmptyGrid } from '../../src/grid';
function validPayload() {
  const grid = createEmptyGrid();
  grid[0][0] = 'entrance';
  grid[5][6] = 'guide';
  grid[11][11] = 'shelter';
  return { version: FORMAT_VERSION, grid };
}

describe('合法数据', () => {
  it('接受 12×12 且端点数量合法的数据，并保留全部格值', () => {
    const payload = validPayload();
    const parsed = parseGridData(payload);
    expect(parsed).toHaveLength(GRID_SIZE);
    parsed.forEach((row) => expect(row).toHaveLength(GRID_SIZE));
    expect(parsed[0][0]).toBe('entrance');
    expect(parsed[5][6]).toBe('guide');
    expect(parsed[11][11]).toBe('shelter');
    expect(parsed[0][1]).toBe('empty');
  });

  it('入口与避难点各 1 至 4 个均合法（边界 1 与 4）', () => {
    const payload = validPayload();
    payload.grid[1][0] = 'entrance';
    payload.grid[2][0] = 'entrance';
    payload.grid[3][0] = 'entrance';
    payload.grid[1][1] = 'shelter';
    payload.grid[2][1] = 'shelter';
    payload.grid[3][1] = 'shelter';
    expect(() => parseGridData(payload)).not.toThrow();
  });

  it('导出-导入往返一致', () => {
    const payload = validPayload();
    const grid = parseGridData(payload);
    const text = gridToJson(grid);
    const again = parseGridJson(text);
    expect(again).toEqual(grid);
    expect(JSON.parse(text).version).toBe(FORMAT_VERSION);
  });
});

describe('整份拒绝', () => {
  it('行数错误（11 行）时拒绝', () => {
    const payload = validPayload();
    payload.grid.pop();
    expect(() => parseGridData(payload)).toThrow(GridImportError);
    try {
      parseGridData(payload);
    } catch (error) {
      expect((error as Error).message).toContain('12 行');
    }
  });

  it('行数多于 12 时拒绝', () => {
    const payload = validPayload();
    payload.grid.push(new Array(GRID_SIZE).fill('empty'));
    expect(() => parseGridData(payload)).toThrow(/12 行/);
  });

  it('某行列数错误时拒绝', () => {
    const payload = validPayload();
    payload.grid[0] = payload.grid[0].slice(0, 11);
    expect(() => parseGridData(payload)).toThrow(/第 1 行/);
  });

  it('出现未知格类型时拒绝', () => {
    const payload = validPayload() as unknown as {
      version: number;
      grid: unknown[][];
    };
    payload.grid[3][3] = 'lava';
    expect(() => parseGridData(payload)).toThrow(/未知格类型/);
  });

  it('格值不是字符串时拒绝', () => {
    const payload = validPayload() as unknown as {
      version: number;
      grid: unknown[][];
    };
    payload.grid[3][3] = 7;
    expect(() => parseGridData(payload)).toThrow(/不是字符串/);
  });

  it('没有入口（0 个）时拒绝', () => {
    const payload = validPayload();
    payload.grid[0][0] = 'empty';
    expect(() => parseGridData(payload)).toThrow(/入口数量/);
  });

  it('入口 5 个时拒绝', () => {
    const payload = validPayload();
    payload.grid[0][1] = 'entrance';
    payload.grid[0][2] = 'entrance';
    payload.grid[0][3] = 'entrance';
    payload.grid[0][4] = 'entrance';
    expect(() => parseGridData(payload)).toThrow(/入口数量/);
  });

  it('没有避难点（0 个）时拒绝', () => {
    const payload = validPayload();
    payload.grid[11][11] = 'empty';
    expect(() => parseGridData(payload)).toThrow(/避难点数量/);
  });

  it('避难点 5 个时拒绝', () => {
    const payload = validPayload();
    payload.grid[10][0] = 'shelter';
    payload.grid[10][1] = 'shelter';
    payload.grid[10][2] = 'shelter';
    payload.grid[10][3] = 'shelter';
    expect(() => parseGridData(payload)).toThrow(/避难点数量/);
  });

  it('同时存在多项缺陷时全部列出', () => {
    const payload = validPayload();
    payload.grid[3][3] = 'unknown' as unknown as 'guide';
    payload.grid[11][11] = 'empty'; // 去掉唯一避难点
    let message = '';
    try {
      parseGridData(payload);
      throw new Error('应当抛出异常');
    } catch (error) {
      expect(error).toBeInstanceOf(GridImportError);
      message = (error as Error).message;
    }
    expect(message).toContain('未知格类型');
    expect(message).toContain('避难点数量');
  });

  it('顶层不是对象、缺少 grid、grid 不是数组均拒绝', () => {
    expect(() => parseGridData([1, 2])).toThrow(GridImportError);
    expect(() => parseGridData({ version: 1 })).toThrow(/grid 字段/);
    expect(() => parseGridData({ version: 1, grid: {} })).toThrow(/二维数组/);
  });
});

describe('parseGridJson', () => {
  it('JSON 语法错误转换为 GridImportError', () => {
    expect(() => parseGridJson('{ not json')).toThrow(GridImportError);
  });

  it('合法 JSON 文本可解析', () => {
    const text = JSON.stringify(validPayload());
    const grid = parseGridJson(text);
    expect(grid[0][0]).toBe('entrance');
  });
});
