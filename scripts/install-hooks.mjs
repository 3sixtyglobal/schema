// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
/**
 * This script points git at the version controlled hooks directory.
 * It runs from the prepare lifecycle script, so every clone picks the hooks
 * up on its first install.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const hooksPath = '.githooks';

// Hooks are only of use in a local clone, there is nothing to install in CI
// or when the package has been extracted without its git directory.
if (!process.env.CI && fs.existsSync('.git')) {
	try {
		execFileSync('git', ['config', 'core.hooksPath', hooksPath], { stdio: 'ignore' });
	} catch (err) {
		process.stderr.write(`WARNING: Unable to set the git hooks path to ${hooksPath}.\n`);
		process.stderr.write(`${err.message}\n`);
	}
}
