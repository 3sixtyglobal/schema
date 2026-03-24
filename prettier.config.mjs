// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/** @type {import("prettier").Config} */
export default {
	arrowParens: 'avoid',
	bracketSpacing: true,
	endOfLine: 'lf',
	overrides: [
		{
			files: ['*.html'],
			options: {
				htmlWhitespaceSensitivity: 'ignore'
			}
		},
		{
			files: ['*.ts'],
			options: {
				singleQuote: false
			}
		},
		{
			files: ['*.md', '*.mdx'],
			options: {
				useTabs: false
			}
		}
	],
	printWidth: 100,
	semi: true,
	singleQuote: true,
	trailingComma: 'none',
	tabWidth: 2,
	useTabs: true
};
