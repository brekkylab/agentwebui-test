import { expect, test } from '@playwright/test';

const isDesktop = (projectName: string) => projectName === 'desktop';

async function openKlientCo(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByText('KlientCo Q2 분석').first().click();
}

test('DS React app opens to real Projects and uses preview SVG icons', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Your projects/i })).toBeVisible();
  await expect(page.getByText('KlientCo Q2 분석').first()).toBeVisible();
  await expect(page.getByText(/Personal/i).first()).toBeVisible();
  await expect(page.locator('svg.cw-icon').first()).toBeVisible();
  expect(await page.locator('svg.cw-icon').count()).toBeGreaterThan(4);
  await expect(page.locator('img.sheet-icon[src*="/agentk/icons/"]')).toHaveCount(0);
});

test('Project click opens DS Project Home with reference sessions and activity', async ({ page }) => {
  await openKlientCo(page);

  await expect(page.getByRole('heading', { name: 'KlientCo Q2 분석' })).toBeVisible();
  await expect(page.getByText(/6 visible to you/i)).toBeVisible();
  await expect(page.locator('.main').getByText('Q2 market read — starting points')).toBeVisible();
  await expect(page.locator('.main').getByText('결정사항 thread (auto-append)')).toBeVisible();
  await expect(page.getByText('주간 진행 정리')).toBeVisible();
});

test('Files route matches two-pane ground-truth browser and desktop folder selection works', async ({ page }, testInfo) => {
  await openKlientCo(page);
  await page.getByText('Files').first().click();

  await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
  await expect(page.locator('.main').getByText(/Market research/).first()).toBeVisible();
  await expect(page.getByText('Q2 market report.pdf')).toBeVisible();
  await expect(page.getByText('Competitor scan — raw.xlsx')).toBeVisible();

  // On mobile the left folder rail is intentionally collapsed into the same scroll context;
  // desktop proves the folder-selection behavior while mobile smoke proves the page loads.
  if (isDesktop(testInfo.project.name)) {
    await page.getByRole('button', { name: /Client materials/ }).click();
    await expect(page.getByText('KlientCo — engagement brief.docx')).toBeVisible();
  }
});

test('Session route has real transcript, side context on desktop, share state, and mock send', async ({ page }, testInfo) => {
  await openKlientCo(page);
  await page.locator('.main').getByText('Q2 market read — starting points').click();

  await expect(page.getByRole('heading', { name: 'Q2 market read — starting points' })).toBeVisible();
  await expect(page.getByText(/Three angles, ranked/i)).toBeVisible();

  if (isDesktop(testInfo.project.name)) {
    await expect(page.locator('aside').getByText('Referenced files')).toBeVisible();
    await expect(page.locator('aside').getByText('Q2 market report.pdf', { exact: true })).toBeVisible();
  }

  await page.getByPlaceholder(/Message Cowork/i).fill('Files 기준으로 board memo 핵심 결정을 업데이트해줘.');
  await page.getByRole('button', { name: /Send/i }).click();
  await expect(page.getByText('Files 기준으로 board memo 핵심 결정을 업데이트해줘.')).toBeVisible();
  await expect(page.getByText(/ground truth로 읽고 답변할게요/i)).toBeVisible({ timeout: 6000 });
});

test('self-serve controls create project/session instead of dead-ending', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /New project/i }).click();
  await expect(page.getByRole('heading', { name: '새 Project 만들기' })).toBeVisible();
  await page.getByLabel('Name').fill('Investor diligence room');
  await page.getByLabel('Description').fill('Mock room for checking self-serve project creation.');
  await page.getByRole('button', { name: /Create mock project/i }).click();

  await expect(page.getByRole('heading', { name: 'Investor diligence room' })).toBeVisible();
  await expect(page.getByText(/새 Project가 mock workspace/)).toBeVisible();
  await expect(page.locator('.main').getByText('Investor diligence room kickoff')).toBeVisible();

  await page.getByRole('button', { name: /New session/i }).click();
  await expect(page.getByRole('heading', { name: '새 Session의 작업 성격을 고르세요' })).toBeVisible();
  await page.getByLabel('Title').fill('Adversarial session title');
  await page.getByRole('button', { name: /Session 만들기/i }).click();
  await expect(page.getByRole('heading', { name: 'Adversarial session title' })).toBeVisible();
});

test('composer preserves fast user input and selected files are pinned to session', async ({ page }) => {
  await openKlientCo(page);
  await page.getByRole('button', { name: /^Files$/ }).click();

  await page.getByRole('button', { name: /Client materials/ }).click();
  await page.getByText('Revenue cohort.xlsx').click();
  await page.getByRole('button', { name: /Pin selected files to session/i }).click();
  await expect(page.getByRole('heading', { name: 'Q2 market read — starting points' })).toBeVisible();
  await expect(page.getByText(/file을 session ground truth로 pin/)).toBeVisible();
  await expect(page.getByText('Revenue cohort.xlsx').first()).toBeAttached();

  const unique = `fast typed message ${Date.now()}`;
  await page.getByPlaceholder(/Message Cowork/i).fill(unique);
  await page.getByRole('button', { name: /Send/i }).click();
  await expect(page.getByText(unique)).toBeVisible();
  await expect(page.getByText(/ground truth로 읽고 답변할게요/i)).toBeVisible({ timeout: 6000 });
});

test('files surface has empty state plus mock upload and non-KlientCo projects work', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cw-project-card').filter({ hasText: 'GTM 재설계' }).click();
  await expect(page.getByRole('heading', { name: 'GTM 재설계 — 2026 H2' })).toBeVisible();

  await page.getByRole('button', { name: /^Files$/ }).click();
  await expect(page.getByText('H2 launch brief.pdf')).toBeVisible();
  await page.getByPlaceholder('파일 검색').fill('nothing-matches-this');
  await expect(page.getByText('No files match')).toBeVisible();

  await page.getByRole('button', { name: /Upload file/i }).click();
  await page.getByLabel('File name').fill('GTM notes.pdf');
  await page.locator('.cw-dialog').getByRole('button', { name: /^Upload file$/ }).click();
  await expect(page.getByText(/GTM notes.pdf uploaded/)).toBeVisible();
  await page.getByPlaceholder('파일 검색').fill('GTM notes');
  await expect(page.locator('.cw-file-row').filter({ hasText: 'GTM notes.pdf' })).toBeVisible();
});

test('Design System preview anatomy is present in cards, files, and messages', async ({ page }) => {
  await page.goto('/');

  const activeProject = page.locator('.cw-project-card.is-active').filter({ hasText: 'KlientCo Q2 분석' });
  await expect(activeProject.locator('.cw-role-badge.owner')).toBeVisible();
  await expect(activeProject.locator('.cw-card-stats')).toContainText(/개 세션/);

  await activeProject.click();
  const unreadSession = page.locator('.cw-session-card.is-unread').filter({ hasText: 'Q2 market read' });
  await expect(unreadSession.locator('.cw-session-last .who')).toBeVisible();
  await expect(unreadSession.locator('.cw-unread-badge')).toContainText('5');
  await expect(page.locator('.cw-session-card').filter({ hasText: 'Draft — board memo' }).locator('.cw-caught-up')).toBeVisible();

  await page.getByRole('button', { name: /^Files$/ }).click();
  await expect(page.locator('.cw-nav-files svg.cw-icon').first()).toBeVisible();
  await expect(page.locator('.cw-file-path .cw-nav-search svg.cw-icon')).toBeVisible();
  await expect(page.locator('.cw-file-row').filter({ hasText: 'Q2 market report.pdf' }).locator('.cw-file-pdf svg.cw-icon')).toBeVisible();
  await expect(page.locator('.cw-file-row').filter({ hasText: 'Competitor scan' }).locator('.cw-file-sheet svg.cw-icon')).toBeVisible();
  await expect(page.locator('.cw-dropzone .cw-nav-add svg.cw-icon')).toBeVisible();
  await expect(page.locator('.cw-knowledge .cw-nav-content svg.cw-icon')).toBeVisible();
  await expect(page.locator('.cw-file-row').filter({ hasText: 'Q2 market report.pdf' }).locator('.cw-file-main .meta')).toContainText(/2.1 MB/);
  await page.getByRole('button', { name: /Client materials/ }).click();
  await expect(page.locator('.cw-file-row').filter({ hasText: 'KlientCo — engagement brief.docx' }).locator('.cw-file-doc svg.cw-icon')).toBeVisible();

  await page.locator('.cw-session-row').filter({ hasText: 'Q2 market read' }).click();
  await expect(page.locator('.cw-message.is-self .cw-message-bubble')).toBeVisible();
  await expect(page.locator('.cw-message.is-ai .cw-ai-prose').first()).toBeVisible();
  await expect(page.locator('svg.cw-icon').first()).toBeVisible();
  await expect(page.locator('img.sheet-icon[src*="/agentk/icons/"]')).toHaveCount(0);
});

test('Skills tab mirrors AGENT K export: list, create modal, mention copy, and run creates session', async ({ page }) => {
  await openKlientCo(page);
  await page.getByRole('button', { name: /^Skills$/ }).click();

  await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
  await expect(page.locator('.cw-skill-card').filter({ hasText: '주간 진행 정리' })).toContainText('RUNNABLE');
  await expect(page.locator('.cw-skill-card').filter({ hasText: 'KlientCo 보고서 스타일 가이드' })).toContainText('REFERENCE');

  await page.locator('.cw-skill-card').filter({ hasText: '주간 진행 정리' }).getByRole('button', { name: /@mention 복사/ }).click();
  await expect(page.getByText(/@주간 진행 정리 복사됨/)).toBeVisible();

  await page.getByRole('button', { name: /새 Skill/ }).click();
  await expect(page.getByRole('heading', { name: '새 Skill 만들기' })).toBeVisible();
  await page.getByLabel('이름').fill('리스크 체크');
  await page.getByLabel('설명').fill('결정 전 blocker와 open question을 점검한다.');
  await page.getByLabel('언제 쓸까').fill('팀 결정 artifact를 만들기 직전');
  await page.getByLabel('본문 (markdown)').fill('- evidence 확인\n- blocker 정리\n- owner 제안');
  await page.getByLabel(/Runnable/).check();
  await page.getByLabel('발화 prompt template').fill('선택된 Files와 최근 session을 기반으로 리스크 체크를 실행해줘.');
  await page.getByLabel('사용할 tool (comma 구분)').fill('rag, files');
  await page.locator('.cw-dialog').getByRole('button', { name: '분석', exact: true }).click();
  await page.getByRole('button', { name: /Skill 만들기/ }).click();

  const newSkill = page.locator('.cw-skill-card').filter({ hasText: '리스크 체크' });
  await expect(newSkill).toBeVisible();
  await expect(newSkill).toContainText('RUNNABLE');
  await newSkill.getByRole('button', { name: /▶ 실행/ }).click();
  await expect(page.getByRole('heading', { name: '리스크 체크 · 실행' })).toBeVisible();
  await expect(page.getByText(/선택된 Files와 최근 session/)).toBeVisible();
});

test('Schedule tab mirrors AGENT K export: modal options, pause/resume, feed run, and session run', async ({ page }) => {
  await openKlientCo(page);
  await page.getByRole('button', { name: /^Schedule$/ }).click();

  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
  await expect(page.locator('.cw-schedule-card').filter({ hasText: '매주 월 09:00' })).toContainText('skill: 주간 진행 정리');
  await expect(page.locator('.cw-schedule-card').filter({ hasText: '매일 18:00' })).toContainText('일시정지됨');

  const paused = page.locator('.cw-schedule-card').filter({ hasText: '결정사항 thread' });
  await paused.getByRole('button', { name: /▶ 재개/ }).click();
  await expect(paused).toContainText('✅ 활성');

  await page.getByRole('button', { name: /새 Schedule/ }).click();
  await expect(page.getByRole('heading', { name: '새 Schedule' })).toBeVisible();
  await page.getByRole('button', { name: '매일' }).click();
  await page.getByLabel('Free prompt 입력').check();
  await page.getByPlaceholder(/오늘 sessions/).fill('오늘 프로젝트에서 나온 blocker를 Activity feed로 남겨줘.');
  await page.getByLabel(/Activity feed에만 신호/).check();
  await page.getByRole('button', { name: /^등록$/ }).click();

  const feedSchedule = page.locator('.cw-schedule-card').filter({ hasText: 'blocker를 Activity feed' });
  await expect(feedSchedule).toBeVisible();
  await feedSchedule.getByRole('button', { name: /▶ 지금 실행/ }).click();
  await expect(page.getByText(/Activity feed에 1줄 추가됨/)).toBeVisible();
  await expect(page.locator('.cw-activity-feed-panel').getByText('오늘 프로젝트에서 나온 blocker를 Activity feed로 남겨줘.')).toBeVisible();

  const weekly = page.locator('.cw-schedule-card').filter({ hasText: '주간 진행 정리' }).first();
  await weekly.getByRole('button', { name: /▶ 지금 실행/ }).click();
  await expect(page.getByRole('heading', { name: '주간 진행 정리 · 자동 발화' })).toBeVisible();
  await expect(page.getByText('── 2026-05-13 18:00 · schedule 발화 ──')).toBeVisible();
});
