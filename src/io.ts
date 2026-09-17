/**
 * 本地 JSON 的导入 / 导出与严格结构校验。
 *
 * 规范格式（字段顺序以导出为准）：
 * {
 *   "version": 1,
 *   "grid": [
 *     ["empty", "guide", ... ],   // 固定 12 行
 *     ...                          // 每行固定 12 个元素
 *   ]
 * }
 *
 * 导入为“整份校验”：尺寸错误、出现未知格类型、入口或避难点数量
 * 不在 1..4 范围内，任一项不满足都拒绝整份数据，由调用方清除旧结论。
 */

import {
  CELL_TYPES,
  type CellType,
  type Grid,
  GRID_SIZE,
  createEmptyGrid,
} from './grid';

export const FORMAT_VERSION = 1;

export interface SerializedGrid {
  version: number;
  grid: CellType[][];
}

export class GridImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GridImportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 严格校验并解析未知 JSON 数据。
 * 收集全部问题后一次性抛出，错误信息列出每一项缺陷。
 */
export function parseGridData(data: unknown): Grid {
  const problems: string[] = [];

  if (!isRecord(data)) {
    throw new GridImportError('JSON 顶层必须是对象，且包含 grid 字段。');
  }
  if (!('grid' in data)) {
    throw new GridImportError('缺少 grid 字段。');
  }

  const rawGrid = data.grid;
  if (!Array.isArray(rawGrid)) {
    throw new GridImportError('grid 必须是二维数组。');
  }

  if (rawGrid.length !== GRID_SIZE) {
    problems.push(`尺寸错误：grid 应有 ${GRID_SIZE} 行，实际为 ${rawGrid.length} 行。`);
  }

  let entranceCount = 0;
  let shelterCount = 0;
  const parsed: Grid = createEmptyGrid();

  rawGrid.forEach((rawRow, rowIndex) => {
    if (rowIndex >= GRID_SIZE) return; // 行数错误已记录；多余行不参与解析
    if (!Array.isArray(rawRow)) {
      problems.push(`第 ${rowIndex + 1} 行不是数组。`);
      return;
    }
    if (rawRow.length !== GRID_SIZE) {
      problems.push(
        `尺寸错误：第 ${rowIndex + 1} 行应有 ${GRID_SIZE} 格，实际为 ${rawRow.length} 格。`,
      );
    }
    rawRow.forEach((rawCell, colIndex) => {
      if (colIndex >= GRID_SIZE) return;
      if (typeof rawCell !== 'string') {
        problems.push(
          `第 ${rowIndex + 1} 行第 ${colIndex + 1} 列不是字符串格类型。`,
        );
        return;
      }
      if (!CELL_TYPES.includes(rawCell as CellType)) {
        problems.push(
          `未知格类型：第 ${rowIndex + 1} 行第 ${colIndex + 1} 列的值 "${rawCell}" 不在允许类型内。`,
        );
        return;
      }
      const type = rawCell as CellType;
      parsed[rowIndex][colIndex] = type;
      if (type === 'entrance') entranceCount += 1;
      if (type === 'shelter') shelterCount += 1;
    });
  });

  if (entranceCount < 1 || entranceCount > 4) {
    problems.push(
      `入口数量必须在 1 至 4 个之间，当前为 ${entranceCount} 个。`,
    );
  }
  if (shelterCount < 1 || shelterCount > 4) {
    problems.push(
      `避难点数量必须在 1 至 4 个之间，当前为 ${shelterCount} 个。`,
    );
  }

  if (problems.length > 0) {
    throw new GridImportError(`导入被拒绝：\n- ${problems.join('\n- ')}`);
  }

  return parsed;
}

/** 解析 JSON 文本；语法错误同样转换为 GridImportError。 */
export function parseGridJson(text: string): Grid {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (cause) {
    throw new GridImportError(
      `导入被拒绝：JSON 语法错误（${(cause as Error).message}）。`,
    );
  }
  return parseGridData(data);
}

export function serializeGrid(grid: Grid): SerializedGrid {
  return {
    version: FORMAT_VERSION,
    grid: grid.map((row) => [...row]),
  };
}

/** 导出为带缩进的 JSON 文本。 */
export function gridToJson(grid: Grid): string {
  return JSON.stringify(serializeGrid(grid), null, 2);
}
