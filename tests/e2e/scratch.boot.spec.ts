// MOD-Scratch at the app's start-up (F-015.AC14, INV-01): the tool takes its session lock and sweeps the
// scratch left by a page that closed during an export. Runs on the production build (dist/).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, test, type Page } from '@playwright/test';
import { PREVIEW_PORT } from './support/ports';

const APP = `http://localhost:${PREVIEW_PORT}/`;

const listScratch = (page: Page) =>
  page.evaluate(async () => {
    const dir = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('clip-maker-scratch', {
      create: true,
    });
    const names: string[] = [];
    for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
    return names;
  });

test('F-015.AC14 the next time the tool opens, a closed page’s export scratch is gone', async ({
  page: first,
  browserName,
  playwright,
}) => {
  test.setTimeout(60_000);
  // Playwright WebKit's default context has no origin-private file system: use a persistent one there.
  let page = first;
  let close = async (): Promise<void> => undefined;
  if (browserName === 'webkit') {
    const dir = mkdtempSync(`${tmpdir()}/clip-maker-boot-`);
    const ctx = await playwright.webkit.launchPersistentContext(dir);
    page = ctx.pages()[0] ?? (await ctx.newPage());
    close = async () => {
      await ctx.close();
      rmSync(dir, { recursive: true, force: true });
    };
  }
  // A page that closed during an export left its files (its session lock is gone with it). They are
  // made from a same-origin page without the app, so the app's own start-up sweep (which runs after
  // the F-023 device check) cannot race with making them.
  await page.goto(`${APP}third-party-notices.txt`);
  await page.evaluate(async () => {
    const dir = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('clip-maker-scratch', {
      create: true,
    });
    await dir.getFileHandle('export-closedtab1-aaaa.part', { create: true });
    await dir.getFileHandle('export-closedtab1-bbbb.part', { create: true });
  });
  expect(await listScratch(page)).toEqual(
    expect.arrayContaining(['export-closedtab1-aaaa.part', 'export-closedtab1-bbbb.part']),
  );
  await page.goto(APP);
  await expect.poll(() => listScratch(page), { timeout: 10_000 }).toEqual([]);
  await close();
});
