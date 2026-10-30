import { test, expect } from "@playwright/test";

const adminItem = {
  item_id: 7,
  main_category: "Curries",
  subcategory: "Paneer",
  item_name: "Kadai Paneer",
  quantity_serving: "Serves 1",
  price_eur: "13.00",
  short_information: "Fresh paneer with peppers.",
  image_url: null,
  is_available: 1,
};

async function mockAdminApi(page, { loginStatus = 200, onSave } = {}) {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("**/api/admin/login", (route) => route.fulfill({
    status: loginStatus,
    json: loginStatus === 200
      ? { token: "test-admin-token", message: "Signed in." }
      : { error: "Invalid username or password." },
  }));
  await page.route("**/api/admin/session", (route) => route.fulfill({
    status: route.request().headers().authorization === "Bearer test-admin-token" ? 200 : 401,
    json: { role: "admin", username: "test-admin" },
  }));
  await page.route("**/api/admin/menu", async (route) => {
    if (route.request().method() === "POST" || route.request().method() === "PUT") {
      onSave?.(route.request().postDataJSON());
      await route.fulfill({ json: { message: "Menu item saved.", item_id: 8 } });
      return;
    }
    await route.fulfill({ json: [adminItem] });
  });
}

test("protected admin route sends signed-out visitors to sign in", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/admin/menu");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
});

test("admin can sign in and create a menu item", async ({ page }) => {
  let savedItem;
  await mockAdminApi(page, { onSave: (item) => { savedItem = item; } });
  await page.goto("/admin/login");
  await page.getByLabel("Password").fill("safe-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Welcome to your dashboard" })).toBeVisible();
  await page.getByRole("link", { name: /Menu Management/ }).click();
  await expect(page.getByRole("heading", { name: "Menu Management \/ Ruokalistan hallinta" })).toBeVisible();
  await expect(page.getByText("Kadai Paneer")).toBeVisible();
  await page.getByLabel("Dish name *").fill("Vegetable Pulao");
  await page.getByLabel("Main category *").fill("Rice");
  await page.getByLabel("Price (€) *").fill("10.50");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText("Menu item added successfully.")).toBeVisible();
  expect(savedItem).toMatchObject({ item_name: "Vegetable Pulao", main_category: "Rice", price_eur: 10.5 });
});

test("admin login shows the server rejection without entering the dashboard", async ({ page }) => {
  await mockAdminApi(page, { loginStatus: 401 });
  await page.goto("/admin/login");
  await page.getByLabel("Password").fill("wrong-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid username or password");
  await expect(page).toHaveURL(/\/admin\/login$/);
});
