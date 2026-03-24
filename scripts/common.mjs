// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { exec, spawn } from 'node:child_process';
import fs from 'node:fs/promises';

/**
 * Load a JSON file.
 * @param filePath The path to load as JSON.
 * @returns The loaded JSON.
 */
export async function loadJson(filePath) {
	const content = await fs.readFile(filePath, 'utf8');

	return JSON.parse(content);
}

/**
 * Save a JSON file.
 * @param filePath The path to save the object as JSON.
 * @param obj The object to save as JSON.
 */
export async function saveJson(filePath, obj) {
	await fs.writeFile(filePath, `${JSON.stringify(obj, undefined, '\t')}\n`, 'utf8');
}

/**
 * Run a shell app.
 * @param app The app to run in the shell.
 * @param args The args for the app.
 * @param cwd The working directory to execute the command in.
 * @returns Promise to wait for command execution to complete.
 */
export async function runShellCmd(app, args, cwd) {
	return new Promise((resolve, reject) => {
		process.stdout.write(`${app} ${args.join(' ')}\n`);

		const osCommand = process.platform.startsWith('win') ? `${app}.cmd` : app;

		const sp = spawn(osCommand, args, {
			stdio: 'inherit',
			shell: true,
			cwd
		});

		sp.on('exit', (exitCode, signals) => {
			if (Number.parseInt(exitCode, 10) !== 0 || signals?.length) {
				reject(new Error('Run failed'));
			} else {
				resolve();
			}
		});
	});
}

/**
 * Execute a command asynchronously.
 * @param command The command to execute
 * @returns The stdout output
 */
export function execAsync(command) {
	return new Promise((resolve, reject) => {
		exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
			if (error) {
				reject(error);
			} else {
				resolve(stdout.trim());
			}
		});
	});
}

/**
 * Does the specified file exist.
 * @param filename The filename to check for existence.
 * @returns True if the file exists.
 */
export async function fileExists(filename) {
	try {
		const stats = await fs.stat(filename);
		return stats.isFile();
	} catch {
		return false;
	}
}

/**
 * Does the specified directory exist.
 * @param directory The directory to check for existence.
 * @returns True if the directory exists.
 */
export async function directoryExists(directory) {
	try {
		const stats = await fs.stat(directory);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Is the file/directory a symbolic link.
 * @param item The item to check if it's a symbolic link.
 * @returns True if the item is a symbolic link.
 */
export async function isSymbolicLink(item) {
	try {
		const stats = await fs.lstat(item);
		return stats.isSymbolicLink();
	} catch {
		return false;
	}
}

/**
 * Strip interface prefix if there is one.
 * @param input The input to strip.
 * @returns The input with any interface prefix stripped.
 */
export function stripPrefix(input) {
	if (typeof input === 'string' && input.length > 0) {
		let output = input;
		if (/^I[A-Z]/.test(output)) {
			output = output.slice(1);
		}
		return output;
	}

	return '';
}

/**
 * Split a string into words.
 * @param input The input to split.
 * @returns The string split into words.
 */
export function words(input) {
	if (!(typeof input === 'string' && input.length > 0)) {
		return [];
	}

	const normalized = input
		.replace(/([\da-z])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.replace(/[._-]+/g, ' ');

	return normalized.trim().match(/[^\u0000-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007F]+/g) ?? [];
}

/**
 * Convert the input string to kebab case.
 * @param input The input to convert.
 * @param stripInterfacePrefix Strip interface prefixes.
 * @returns The kebab case version of the input.
 */
export function kebabCase(input, stripInterfacePrefix = true) {
	if (typeof input === 'string' && input.length > 0) {
		let output = input;
		if (stripInterfacePrefix && /^I[A-Z]/.test(output)) {
			output = output.slice(1);
		}
		return words(output).join('-').toLowerCase();
	}

	return '';
}

/**
 * Convert the input string to snake case.
 * @param input The input to convert.
 * @param stripInterfacePrefix Strip interface prefixes.
 * @returns The snake case version of the input.
 */
export function snakeCase(input, stripInterfacePrefix = true) {
	if (typeof input === 'string' && input.length > 0) {
		let output = input;
		if (stripInterfacePrefix && /^I[A-Z]/.test(output)) {
			output = output.slice(1);
		}
		return words(output).join('_').toLowerCase();
	}

	return '';
}

/**
 * Pascal case all the words.
 * @param input The input to convert.
 * @param stripInterfacePrefix Strip interface prefixes.
 * @returns The pascal case version of the input.
 */
export function pascalCase(input, stripInterfacePrefix = true) {
	if (typeof input === 'string' && input.length > 0) {
		let output = input;
		if (stripInterfacePrefix && /^I[A-Z]/.test(output)) {
			output = output.slice(1);
		}
		return words(output)
			.map(w => {
				if (w.length > 1 && w === w.toUpperCase()) {
					return w;
				}
				return `${w[0].toUpperCase()}${w.slice(1).toLowerCase()}`;
			})
			.join('');
	}

	return '';
}

/**
 * Camel case all the words.
 * @param input The input to convert.
 * @param stripInterfacePrefix Strip interface prefixes.
 * @returns The camel case version of the input.
 */
export function camelCase(input, stripInterfacePrefix = true) {
	if (typeof input === 'string' && input.length > 0) {
		let output = input;
		if (stripInterfacePrefix && /^I[A-Z]/.test(output)) {
			output = output.slice(1);
		}
		const splitWords = words(output);
		return splitWords.length === 0
			? ''
			: `${splitWords[0].toLowerCase()}${splitWords
					.slice(1)
					.map(w => {
						if (w.length > 1 && w === w.toUpperCase()) {
							return w;
						}
						return `${w[0].toUpperCase()}${w.slice(1).toLowerCase()}`;
					})
					.join('')}`;
	}

	return '';
}

/**
 * Convert a string to uppercase.
 * @param input The input to convert.
 * @returns The uppercase version of the input.
 */
export function upperCase(input) {
	return input?.toUpperCase() ?? '';
}

/**
 * Convert a string to interface case (PascalCase with I prefix).
 * @param input The input to convert.
 * @returns The interface case version of the input.
 */
export function interfaceCase(input) {
	const pascal = pascalCase(input, false);
	return pascal ? `I${pascal}` : '';
}
