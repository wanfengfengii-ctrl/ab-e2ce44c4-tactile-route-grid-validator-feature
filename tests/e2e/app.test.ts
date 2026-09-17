import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cell = (page: Page, r: number, c: number) =>
  page.getByTestId(`cell-${r}-${c}`);

async function clickTool(page: Page, type: string) {
  await page.getByTestId(`tool-${type}`).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('指针编辑与判定主链路', () => {
  test('初始示例：对角相碰判不可达，高亮可达格与相邻障碍，补正交砖后立即通过', async ({
    page,
  }) => {
    // 初始示例：(1,1)入口-(1,2)导向，与 (2,3)导向仅角点相碰；
    // (2,2) 为障碍，(3,4) 为避难点。
    await expect(page.getByTestId('result-fail')).toBeVisible();
    await expect(page.getByTestId('fail-entrance-row')).toHaveText('2');
    await expect(page.getByTestId('fail-entrance-col')).toHaveText('2');
    await expect(page.getByTestId('fail-shelter-row')).toHaveText('4');
    await expect(page.getByTestId('fail-shelter-col')).toHaveText('5');

    // 入口实际可达格：(1,1)、(1,2)
    await expect(cell(page, 1, 1)).toHaveClass(/is-reachable/);
    await expect(cell(page, 1, 2)).toHaveClass(/is-reachable/);
    await expect(cell(page, 2, 3)).not.toHaveClass(/is-reachable/);

    // 与可达区域共享边的障碍：(2,2)；对角的 (2,3) 是导向砖不在列
    await expect(cell(page, 2, 2)).toHaveClass(/is-blocking/);

    // 用一块导向砖替换障碍 (2,2)：它与 (1,2)、(2,3) 均共享边
    await clickTool(page, 'guide');
    await cell(page, 2, 2).click();

    // 立即重算：整链连通，旧高亮与旧结论一并消失
    await expect(page.getByTestId('result-ok')).toBeVisible();
    await expect(page.getByTestId('result-fail')).toHaveCount(0);
    await expect(cell(page, 1, 1)).not.toHaveClass(/is-reachable/);
    await expect(cell(page, 2, 2)).not.toHaveClass(/is-blocking/);
  });

  test('指针可放置各类格，且对角路径不被判为连通', async ({ page }) => {
    await page.getByTestId('clear-button').click();

    // 清空后端点不足，显示提示而非结论
    await expect(page.getByTestId('setup-warning')).toBeVisible();

    await clickTool(page, 'entrance');
    await cell(page, 0, 0).click();
    await clickTool(page, 'guide');
    await cell(page, 1, 1).click(); // 仅对角接触
    await clickTool(page, 'shelter');
    await cell(page, 2, 2).click();

    await expect(page.getByTestId('result-fail')).toBeVisible();
    await expect(cell(page, 0, 0)).toHaveClass(/is-reachable/);
    await expect(cell(page, 1, 1)).not.toHaveClass(/is-reachable/);

    // 补齐正交连接砖 (0,1)、(1,2)
    await clickTool(page, 'guide');
    await cell(page, 0, 1).click();
    await cell(page, 1, 2).click();
    await expect(page.getByTestId('result-ok')).toBeVisible();
  });
});

test.describe('键盘编辑', () => {
  test('方向键移动焦点，数字键选择工具并落笔，搭建正交链后通过', async ({
    page,
  }) => {
    await page.getByTestId('clear-button').click();
    await cell(page, 5, 5).click();

    // 在 (5,5) 放入入口（数字 4 = entrance，同时切换工具）
    await page.keyboard.press('4');
    await expect(cell(page, 5, 5)).toHaveAttribute('data-type', 'entrance');

    // 右移两格铺导向砖（数字 3 = guide）
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('3');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('3');
    await expect(cell(page, 5, 6)).toHaveAttribute('data-type', 'guide');
    await expect(cell(page, 5, 7)).toHaveAttribute('data-type', 'guide');

    // 下移后放避难点（数字 5 = shelter）
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('5');
    await expect(cell(page, 6, 7)).toHaveAttribute('data-type', 'shelter');

    // (5,7) 与 (6,7) 共享边，整条链连通
    await expect(page.getByTestId('result-ok')).toBeVisible();

    // Delete 擦掉关键砖 (5,7) 后立即变为不可达
    await cell(page, 5, 7).click();
    await page.keyboard.press('Delete');
    await expect(cell(page, 5, 7)).toHaveAttribute('data-type', 'empty');
    await expect(page.getByTestId('result-fail')).toBeVisible();
  });
});

test.describe('JSON 导入', () => {
  function writeJson(name: string, data: unknown): string {
    const path = join(tmpdir(), name);
    writeFileSync(path, JSON.stringify(data), 'utf8');
    return path;
  }

  function passingGrid(): string[][] {
    const grid = Array.from({ length: 12 }, () =>
      Array<string>(12).fill('empty'),
    );
    grid[0][0] = 'entrance';
    grid[0][1] = 'guide';
    grid[0][2] = 'guide';
    grid[0][3] = 'shelter';
    return grid;
  }

  test('导入合法文件后按新网格判定通过', async ({ page }) => {
    const path = writeJson('valid-grid.json', { version: 1, grid: passingGrid() });
    await page.getByTestId('import-file').setInputFiles(path);

    await expect(page.getByTestId('import-error')).toHaveCount(0);
    await expect(page.getByTestId('result-ok')).toBeVisible();
    await expect(cell(page, 0, 1)).toHaveAttribute('data-type', 'guide');
  });

  test('尺寸错误：整份拒绝、清除旧结论并显示错误', async ({ page }) => {
    // 初始示例先有失败结论
    await expect(page.getByTestId('result-fail')).toBeVisible();

    const bad = passingGrid().slice(0, 11); // 只有 11 行
    const path = writeJson('bad-size.json', { version: 1, grid: bad });
    await page.getByTestId('import-file').setInputFiles(path);

    await expect(page.getByTestId('import-error')).toBeVisible();
    const errorText = await page.getByTestId('import-error').innerText();
    expect(errorText).toContain('12 行');
    // 旧结论被清除
    await expect(page.getByTestId('result-fail')).toHaveCount(0);
    await expect(page.getByTestId('result-ok')).toHaveCount(0);
    // 画布保持拒绝前的网格（初始示例）
    await expect(cell(page, 1, 1)).toHaveAttribute('data-type', 'entrance');

    // 再导入合法文件，错误清除并恢复判定
    const validPath = writeJson('valid-grid-2.json', {
      version: 1,
      grid: passingGrid(),
    });
    await page.getByTestId('import-file').setInputFiles(validPath);
    await expect(page.getByTestId('import-error')).toHaveCount(0);
    await expect(page.getByTestId('result-ok')).toBeVisible();
  });

  test('未知格类型：整份拒绝并指出坐标', async ({ page }) => {
    const grid = passingGrid();
    grid[4][4] = 'lava';
    const path = writeJson('unknown-type.json', { version: 1, grid });
    await page.getByTestId('import-file').setInputFiles(path);

    const errorText = await page.getByTestId('import-error').innerText();
    expect(errorText).toContain('未知格类型');
    expect(errorText).toContain('第 5 行第 5 列');
  });

  test('端点数量越界（0 个避难点）：整份拒绝', async ({ page }) => {
    const grid = passingGrid();
    grid[0][3] = 'empty';
    const path = writeJson('no-shelter.json', { version: 1, grid });
    await page.getByTestId('import-file').setInputFiles(path);

    const errorText = await page.getByTestId('import-error').innerText();
    expect(errorText).toContain('避难点数量');
  });

  test('JSON 语法错误：整份拒绝', async ({ page }) => {
    const path = join(tmpdir(), 'syntax-broken.json');
    writeFileSync(path, '{ grid: [ ', 'utf8');
    await page.getByTestId('import-file').setInputFiles(path);

    const errorText = await page.getByTestId('import-error').innerText();
    expect(errorText).toContain('JSON 语法错误');
  });
});

test.describe('JSON 导出', () => {
  test('导出当前网格为本地 JSON 文件，结构正确可回读', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-button').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('tactile-grid.json');

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    expect(data.version).toBe(1);
    expect(data.grid).toHaveLength(12);
    for (const row of data.grid) expect(row).toHaveLength(12);
    expect(data.grid[1][1]).toBe('entrance');
    expect(data.grid[3][4]).toBe('shelter');
  });
});
