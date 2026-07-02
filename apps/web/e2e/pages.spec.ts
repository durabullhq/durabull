import {
  createConnection,
  deleteConnection,
  expect,
  ensureActiveOrg,
  findJobByStatus,
  getDefaultConnectionId,
  getJob,
  getJobs,
  getTestQueueName,
  getScheduledJobs,
  TEST_ORG_SLUG,
  test,
} from "./fixtures/test";

async function getConnectionAndQueue(page: Parameters<typeof ensureActiveOrg>[0]) {
  await ensureActiveOrg(page);
  const connectionId = await getDefaultConnectionId(page);
  const queueName = await getTestQueueName(page, connectionId);
  return { connectionId, queueName };
}

test.describe("Pages", () => {
  test("dashboard loads and queue row navigates", async ({ page }) => {
    const { connectionId, queueName } = await getConnectionAndQueue(page);

    await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}`);
    await expect(
      page.getByRole("heading", { name: "Queues", exact: true, level: 1 })
    ).toBeVisible();

    const queueRow = page.getByTestId(`queue-row-${queueName}`);
    await expect(queueRow).toBeVisible();
    await queueRow.locator("td").nth(1).click();

    await page.waitForURL(
      new RegExp(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${queueName}`)
    );
    await expect(
      page.getByRole("heading", { name: queueName, exact: true, level: 1 })
    ).toBeVisible();
  });

  test("shows a clear Redis connection failure message for unreachable connections", async ({
    page,
  }) => {
    await ensureActiveOrg(page);

    const connection = await createConnection(page, {
      name: `Broken Redis ${Date.now()}`,
      url: "redis://does-not-exist.invalid:6379",
      environment: "development",
    });

    try {
      await page.goto(`/${TEST_ORG_SLUG}/c/${connection.id}`);

      await expect(
        page.getByRole("heading", { name: "Failed to load queues", exact: true, level: 2 })
      ).toBeVisible({ timeout: 25000 });

      await expect(
        page.getByText(
          "Unable to connect to Redis for this connection. Verify Redis URL, credentials, TLS settings, and IP allowlist, then retry."
        )
      ).toBeVisible();
    } finally {
      await deleteConnection(page, connection.id);
    }
  });

  test("queues page buttons and links", async ({ page }) => {
    const { connectionId, queueName } = await getConnectionAndQueue(page);

    await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}`);
    await expect(
      page.getByRole("heading", { name: "Queues", exact: true, level: 1 })
    ).toBeVisible();

    await expect(page.getByRole("columnheader", { name: "Queue" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Failed" })).toBeVisible();

    const queueRow = page.getByTestId(`queue-row-${queueName}`);
    await expect(queueRow).toBeVisible();

    await queueRow.locator("td").nth(1).click();
    await page.waitForURL(
      new RegExp(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${queueName}`)
    );

    await page.goBack();
    await expect(queueRow).toBeVisible();

    await queueRow.hover();
    const actionsButton = queueRow.getByRole("button", { name: "Queue actions" });
    await expect(actionsButton).toBeVisible();
    await actionsButton.click();

    const viewDetails = page.getByRole("menuitem", { name: "View Details" });
    await expect(viewDetails).toBeVisible();
    await viewDetails.click();
    await page.waitForURL(
      new RegExp(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${queueName}`)
    );
  });

  test("queues page sidebar links", async ({ page }) => {
    const { connectionId } = await getConnectionAndQueue(page);

    await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}`);
    await expect(
      page.getByRole("heading", { name: "Queues", exact: true, level: 1 })
    ).toBeVisible();

    await page.getByRole("link", { name: "Workers" }).click();
    await page.waitForURL(new RegExp(`/${TEST_ORG_SLUG}/c/${connectionId}/workers`));
    await expect(
      page.getByRole("heading", { name: "Workers", exact: true, level: 1 })
    ).toBeVisible();

    await page.getByRole("link", { name: "Scheduled Jobs" }).click();
    await page.waitForURL(new RegExp(`/${TEST_ORG_SLUG}/c/${connectionId}/scheduled-jobs`));
    await expect(
      page.getByRole("heading", { name: "Scheduled Jobs", exact: true, level: 1 })
    ).toBeVisible();

    await page.getByRole("link", { name: "KV Explorer" }).click();
    await page.waitForURL(new RegExp(`/${TEST_ORG_SLUG}/c/${connectionId}/redis-keys`));
    await expect(
      page.getByRole("heading", { name: "Redis Explorer", exact: true, level: 1 })
    ).toBeVisible();
  });

  test("queue detail pause/resume and delete dialog", async ({ page }) => {
    const { connectionId, queueName } = await getConnectionAndQueue(page);

    await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${queueName}`);
    await expect(
      page.getByRole("heading", { name: queueName, exact: true, level: 1 })
    ).toBeVisible();

    const resumeButton = page.getByRole("button", { name: "Resume" });
    const pauseButton = page.getByRole("button", { name: "Pause" });

    const isPaused = await resumeButton.isVisible().catch(() => false);
    if (isPaused) {
      await resumeButton.click();
      await expect(pauseButton).toBeVisible();
      await pauseButton.click();
      await expect(resumeButton).toBeVisible();
    } else {
      await pauseButton.click();
      await expect(resumeButton).toBeVisible();
      await resumeButton.click();
      await expect(pauseButton).toBeVisible();
    }

    await page.getByRole("button", { name: "Queue settings" }).click();
    await page.getByRole("menuitem", { name: "Delete Queue" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog
        .getByTestId("delete-queue-confirm-input")
        .or(dialog.getByText("Queue cannot be deleted"))
        .first()
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("queue jobs tab status filter and scheduled tab", async ({ page }) => {
    const { connectionId, queueName } = await getConnectionAndQueue(page);
    const jobs = await getJobs(page, connectionId, queueName, { page: 1, pageSize: 1 });
    const firstJobId = jobs.jobs.length > 0 ? String(jobs.jobs[0].id) : null;

    await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${queueName}`);
    await expect(page.getByRole("button", { name: "Jobs", exact: true })).toBeVisible();
    if (firstJobId) {
      const jobRow = page.getByTestId(`job-row-${firstJobId}`);
      await expect(jobRow).toBeVisible();
      await jobRow.locator("td").nth(2).click();
      await page.waitForURL(
        new RegExp(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${queueName}/jobs/${firstJobId}`)
      );
      await page.goBack();
      await expect(jobRow).toBeVisible();
    }

    const hideScheduledJobs = page.getByLabel("Hide scheduled jobs");
    await expect(hideScheduledJobs).toBeVisible();
    await expect(hideScheduledJobs).not.toBeChecked();

    await page.selectOption("select", "failed");
    await expect(page).toHaveURL(/status=failed/);

    await hideScheduledJobs.check();
    await expect(page).toHaveURL(/hideScheduled=1/);

    await page.getByRole("button", { name: /Scheduled Jobs/ }).click();
    await expect(
      page.getByRole("heading", { name: "Scheduled Jobs", exact: true, level: 3 })
    ).toBeVisible();
  });

  test("scheduled jobs page toggle all", async ({ page }) => {
    const { connectionId } = await getConnectionAndQueue(page);
    const scheduledJobs = await getScheduledJobs(page, connectionId);
    if (scheduledJobs.total === 0) {
      throw new Error("No scheduled jobs found. Ensure seed data is loaded.");
    }

    await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/scheduled-jobs`);
    await expect(
      page.getByRole("heading", { name: "Scheduled Jobs", exact: true, level: 1 })
    ).toBeVisible();

    const toggleButton = page.getByRole("button", {
      name: /Expand All|Collapse All|Toggle All/,
    });
    await expect(toggleButton).toBeVisible();
    const initialLabel = (await toggleButton.textContent())?.trim() ?? "";
    await toggleButton.click();
    const expectedLabel = initialLabel.includes("Collapse All")
      ? "Expand All"
      : "Collapse All";
    await expect(toggleButton).toHaveText(new RegExp(expectedLabel));
  });

  test("redis explorer page controls", async ({ page }) => {
    const { connectionId } = await getConnectionAndQueue(page);

    await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/redis-keys`);
    await expect(
      page.getByRole("heading", { name: "Redis Explorer", exact: true, level: 1 })
    ).toBeVisible();

    const searchInput = page.getByPlaceholder("Search pattern (e.g., user:*, *session*)");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("cache:*");
    await expect(searchInput).toHaveValue("cache:*");

    const hideBullButton = page.getByRole("button", { name: "Hide bull:*" });
    await hideBullButton.click();
    await expect(hideBullButton).toBeVisible();

    const refreshButton = page
      .locator("button", { has: page.locator("svg.lucide-refresh-cw") })
      .first();
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();
  });

  test("team page loads and invite dialog opens", async ({ page }) => {
    await ensureActiveOrg(page);
    await page.goto(`/${TEST_ORG_SLUG}/team`);

    await expect(
      page.getByRole("heading", { name: "Team", exact: true, level: 1 })
    ).toBeVisible();

    const inviteButton = page.getByRole("button", { name: "Invite Member" });
    await expect(inviteButton).toBeVisible();
    await inviteButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Invite Team Member")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("settings page loads", async ({ page }) => {
    await ensureActiveOrg(page);
    await page.goto("/settings");

    await page.waitForURL(new RegExp(`/${TEST_ORG_SLUG}/settings/connections`));
    await expect(page.getByText("Settings", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Connections", exact: true, level: 1 })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Connections" })).toBeVisible();
  });

  test("invite page shows not found for invalid id", async ({ page }) => {
    await page.goto("/invite/invalid-invitation-id");
    await expect(
      page.getByRole("heading", { name: "Invitation Not Found", exact: true, level: 1 })
    ).toBeVisible();
  });

  test("failed job retry streams status in modal and requeues job", async ({ page }) => {
    const { connectionId } = await getConnectionAndQueue(page);
    const failedJob = await findJobByStatus(page, connectionId, "failed");

    await page.goto(
      `/${TEST_ORG_SLUG}/c/${connectionId}/queues/${failedJob.queueName}/jobs/${failedJob.jobId}`
    );
    const retryButton = page.getByRole("button", { name: "Retry Job" });
    await expect(retryButton).toBeVisible();
    await retryButton.click();

    // The modal requeues the job and starts polling status + logs. Depending
    // on whether a worker picks the job up, it shows the live running phase
    // or jumps straight to a terminal phase - all of them render the log
    // stream pane.
    await expect(
      page.getByRole("heading", {
        name: /Job Running|Waiting for Retry|Job Completed|Job Failed/,
      })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("retry-log-stream")).toBeVisible();

    // The modal is closable at any point; the job keeps running server-side.
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: /^(Close|Done)$/ })
      .first()
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(
        `/${TEST_ORG_SLUG}/c/${connectionId}/queues/${failedJob.queueName}/jobs/${failedJob.jobId}`
      )
    );

    await expect
      .poll(
        async () => {
          const job = await getJob(
            page,
            connectionId,
            failedJob.queueName,
            failedJob.jobId
          );
          return job.status;
        },
        { timeout: 15000 }
      )
      .not.toBe("failed");
  });
});
