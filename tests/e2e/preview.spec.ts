import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

test("desktop preview renders and primary controls update visible state", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.setViewportSize({ width: 1_440, height: 1_000 });
  await page.goto("/preview");

  await expect(page).toHaveTitle("Today's collections — preview");
  await expect(
    page.getByRole("heading", { name: "Today's collections", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Preview data", { exact: true })).toBeVisible();
  await expect(page.getByText("Fully reconciled", { exact: true })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);

  await page.getByRole("button", { name: "Pause automation" }).click();
  await expect(page.getByRole("status")).toContainText("Automation paused");
  await expect(
    page.getByRole("button", { name: "Resume automation" }),
  ).toBeVisible();

  const initialRows = await page.locator("tbody tr").count();
  await page.getByRole("textbox", { name: "Company", exact: true }).fill("Crown");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  expect(initialRows).toBeGreaterThan(1);
  await expect(
    page.getByRole("complementary", { name: /Crown.*details/i }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
  await page.screenshot({
    path: path.join(tmpdir(), "b2b-ar-stage4-desktop.png"),
    fullPage: false,
  });
});

test("mobile preview stays contained and keyboard-visible controls work", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview");
  await expect(
    page.getByRole("heading", { name: "Today's collections", level: 1 }),
  ).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBe(false);

  const unnamedControls = await page.locator("button, input, select, a").evaluateAll(
    (controls) =>
      controls.filter((control) => {
        const element = control as HTMLElement;
        const label =
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.textContent?.trim() ||
          (element instanceof HTMLInputElement
            ? document.querySelector(`label[for='${element.id}']`)?.textContent?.trim()
            : "");
        return !label;
      }).length,
  );
  expect(unnamedControls).toBe(0);

  await page.getByRole("button", { name: "Close company details" }).focus();
  await expect(
    page.getByRole("button", { name: "Close company details" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({
    path: path.join(tmpdir(), "b2b-ar-stage4-mobile.png"),
    fullPage: false,
  });
});

test("unsynchronized preview is honest and contains no fixture balance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.goto("/preview?state=unsynced");

  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText(/synchron/i).first()).toBeVisible();
  await expect(page.getByText("$247,350.18", { exact: true })).toHaveCount(0);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
});
