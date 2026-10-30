import { test, expect } from "@playwright/test";

const menu = [
  {
    item_id: 1,
    main_category: "Main Course",
    subcategory: "Paneer",
    item_name: "Shahi Paneer",
    quantity_serving: "Serves 1",
    price_eur: "12.50",
    short_information: "Creamy tomato and cashew curry.",
    image_url: null,
    is_available: 1,
  },
];

async function mockCustomerApi(page, onOrder, menuItems = menu) {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("**/api/menu", (route) => route.fulfill({ json: menuItems }));
  await page.route("**/api/opening-hours", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/orders", async (route) => {
    const order = route.request().postDataJSON();
    onOrder?.(order);
    await route.fulfill({
      status: 201,
      json: {
        message: "Order saved successfully.",
        order_id: 314,
        total_amount: 12.5,
        delivery_charge_pending_manual_review: false,
      },
    });
  });
}

test("customer can review and place a takeaway order", async ({ page }) => {
  let submittedOrder;
  await mockCustomerApi(page, (order) => { submittedOrder = order; });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Shahi Paneer" })).toBeVisible();
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await page.getByRole("button", { name: /Continue to Checkout/ }).click();
  await page.getByLabel("Full name *").fill("Aino O'Connor");
  await page.getByLabel("Phone number *").fill("+358 40 123 4567");
  await page.getByLabel("Takeaway / pickup").check();
  await page.getByRole("button", { name: "Review Order Details" }).click();
  await expect(page.getByRole("heading", { name: "Review Your Order" })).toBeVisible();
  await page.getByRole("button", { name: /Continue to Payment/ }).click();
  await page.getByRole("button", { name: /Confirm and Place Order/ }).click();

  await expect(page).toHaveURL(/order-confirmation\?order=314/);
  await expect(page.getByRole("heading", { name: "Your order has been placed" })).toBeVisible();
  expect(submittedOrder).toMatchObject({
    customer_name: "Aino O'Connor",
    customer_phone: "+358 40 123 4567",
    order_type: "takeaway",
    items: [{ item_id: 1, quantity: 1 }],
  });
});

test("customer sees validation for malformed contact details", async ({ page }) => {
  await mockCustomerApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await page.getByRole("button", { name: /Continue to Checkout/ }).click();
  await page.getByLabel("Full name *").fill("Aino123");
  await page.getByLabel("Phone number *").fill("123");
  await page.getByLabel("Takeaway / pickup").check();
  await page.getByRole("button", { name: "Review Order Details" }).click();
  await expect(page.getByRole("alert")).toContainText("valid customer name");
});

test("customer sees a clear message when order submission fails", async ({ page }) => {
  await mockCustomerApi(page);
  await page.route("**/api/orders", (route) => route.fulfill({
    status: 503,
    json: { error: "Ordering is temporarily unavailable. Please try again." },
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await page.getByRole("button", { name: /Continue to Checkout/ }).click();
  await page.getByLabel("Full name *").fill("Aino O'Connor");
  await page.getByLabel("Phone number *").fill("+358 40 123 4567");
  await page.getByLabel("Takeaway / pickup").check();
  await page.getByRole("button", { name: "Review Order Details" }).click();
  await page.getByRole("button", { name: /Continue to Payment/ }).click();
  await page.getByRole("button", { name: /Confirm and Place Order/ }).click();
  await expect(page.getByRole("alert")).toContainText("Ordering is temporarily unavailable");
  await expect(page).not.toHaveURL(/order-confirmation/);
});

test("menu and cart fit a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCustomerApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Our menu" })).toBeVisible();
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await page.getByRole("button", { name: /Shopping cart with 1 items/ }).click();
  await expect(page.getByRole("heading", { name: "🛒 Shopping Cart (1)" })).toBeVisible();
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
});

test("legacy uploaded dish images resolve through the configured API host", async ({ page }) => {
  await mockCustomerApi(page, undefined, [{
    ...menu[0],
    image_url: "http://localhost:3001/uploads/menu-item.webp",
  }]);
  await page.goto("/");
  const dishImage = page.locator(".dish-photo");
  await expect(dishImage).toHaveAttribute("src", "http://127.0.0.1:3001/uploads/menu-item.webp");
});
