/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from '@playwright/test';
import { Application, Terminal, SettingsEditor, TerminalCommandIdWithValue } from '../../../../automation';
import { setTerminalTestSettings } from './terminal-helpers';

export function setup(options?: { skipSuite: boolean }) {
	(options?.skipSuite ? describe.skip : describe)('Terminal Input', () => {
		let terminal: Terminal;
		let settingsEditor: SettingsEditor;

		// Acquire automation API
		before(async function () {
			const app = this.app as Application;
			terminal = app.workbench.terminal;
			settingsEditor = app.workbench.settingsEditor;
			await setTerminalTestSettings(app);
		});

		after(async function () {
			await settingsEditor.clearUserSettings();
		});

		it('should paste an OSC 52 copy outside the web terminal', async function () {
			const app = this.app as Application;
			const { currentPage: page, browserContext } = app.code.driver;
			if (!app.web || browserContext.browser()?.browserType().name() !== 'chromium') {
				this.skip();
			}

			await terminal.createTerminal();
			const text = 'copied from the terminal';
			const payload = Buffer.from(text).toString('base64');
			await browserContext.grantPermissions(['clipboard-write'], { origin: new URL(page.url()).origin });
			try {
				await page.evaluate(() => navigator.clipboard.writeText('previous clipboard contents'));
				await terminal.runCommandWithValue(TerminalCommandIdWithValue.WriteDataToTerminal, `\\x1b]52;c;${payload}\\x07OSC52 complete`);
				await terminal.waitForTerminalText(lines => lines.some(line => line.includes('OSC52 complete')));

				const pastePage = await browserContext.newPage();
				try {
					await pastePage.setContent('<textarea></textarea>');
					const input = pastePage.locator('textarea');
					await input.press('ControlOrMeta+v');
					await expect(input).toHaveValue(text);
				} finally {
					await pastePage.close();
				}
			} finally {
				await browserContext.clearPermissions();
			}
		});

		describe('Auto replies', function () {

			// HACK: Retry this suite only on Windows because conpty can rarely lead to unexpected behavior which would
			// cause flakiness. If this does happen, the feature is expected to fail.
			if (process.platform === 'win32') {
				this.retries(3);
			}

			async function writeTextForAutoReply(text: string): Promise<void> {
				// Put the matching word in quotes to avoid powershell coloring the first word and
				// on a new line to avoid cursor move/line switching sequences
				await terminal.runCommandInTerminal(`"\r${text}`, true);
			}

			it('should automatically reply to a custom entry', async () => {
				await settingsEditor.addUserSetting('terminal.integrated.autoReplies', '{ "foo": "bar" }');
				await terminal.createTerminal();
				await writeTextForAutoReply('foo');
				await terminal.waitForTerminalText(buffer => buffer.some(line => line.match(/foo.*bar/)));
			});
		});
	});
}
