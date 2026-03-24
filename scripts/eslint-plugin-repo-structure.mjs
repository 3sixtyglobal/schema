// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import fs from 'node:fs';
import path from 'node:path';
import {
	camelCase,
	interfaceCase,
	kebabCase,
	pascalCase,
	snakeCase,
	upperCase
} from './common.mjs';

/**
 * Get the expected name for a given case type.
 * @param name The original name.
 * @param caseType The case type (kebab, camel, pascal, interface, upper, snake).
 * @returns The expected name in the specified case, or empty string if caseType is invalid.
 */
function getExpectedName(name, caseType) {
	const ext = path.extname(name);
	const stem = path.basename(name, ext);

	switch (caseType) {
		case 'kebab':
			return `${kebabCase(stem)}${ext}`;
		case 'camel':
			return camelCase(stem);
		case 'pascal':
			return pascalCase(stem);
		case 'interface': {
			const baseName = /^I[A-Z]/.test(stem) ? stem.slice(1) : stem;
			return `${interfaceCase(baseName)}${ext}`;
		}
		case 'upper':
			return upperCase(stem);
		case 'snake':
			return `${snakeCase(stem)}${ext}`;
		default:
			return '';
	}
}

/**
 * Check if a name matches the expected case.
 * @param name The name to check.
 * @param caseType The case type to validate against.
 * @returns True if the name matches the case type, false otherwise.
 */
function matchesCase(name, caseType) {
	const ext = path.extname(name);
	const stem = path.basename(name, ext);

	switch (caseType) {
		case 'kebab':
			return kebabCase(stem) === stem;
		case 'camel':
			return camelCase(stem) === stem;
		case 'pascal':
			return pascalCase(stem) === stem;
		case 'interface': {
			if (!/^I[A-Z]/.test(stem)) {
				return false;
			}
			const baseName = stem.slice(1);
			return pascalCase(baseName) === baseName;
		}
		case 'upper':
			return upperCase(stem) === stem;
		case 'snake':
			return snakeCase(stem) === stem;
		default:
			return false;
	}
}

/**
 * Check if a value is a valid rule.
 * @param rule A raw rule value.
 * @returns True if the rule is valid, false otherwise.
 */
function isValidRule(rule) {
	if (typeof rule === 'string') {
		return true;
	}
	if (isValidRuleObject(rule)) {
		return true;
	}
	return false;
}

/**
 * Check if a value is a valid rule.
 * @param rule A raw rule value.
 * @returns True if the rule is valid, false otherwise.
 */
function isValidRuleObject(rule) {
	if (
		typeof rule === 'object' &&
		rule !== null &&
		!Array.isArray(rule) &&
		'case' in rule &&
		typeof rule.case === 'string'
	) {
		return true;
	}
	return false;
}

/**
 * Normalise a rule value into a consistent { case, ignoreSegments } or { regex } object.
 * Rules can be specified as a case type string (kebab, camel, pascal, interface, upper, snake),
 * a regex pattern string (anything else), or an object with { case, ignoreSegments? }.
 * If the case property contains a non-standard case type, it is treated as a regex pattern.
 * @param rule A raw rule value.
 * @returns A normalised rule object, or undefined if the value is not a valid rule.
 */
function normalizeRule(rule) {
	let caseType;
	let ignoreSegments = [];

	if (typeof rule === 'string') {
		caseType = rule;
	} else if (isValidRuleObject(rule)) {
		caseType = rule.case;
		ignoreSegments = rule.ignoreSegments ?? [];
	}

	if (['kebab', 'camel', 'pascal', 'interface', 'upper', 'snake'].includes(caseType)) {
		return { case: caseType, ignoreSegments };
	}
	// If 'case' property contains a non-standard type string, treat as regex
	return { regex: caseType, ignoreSegments };
}

/**
 * Find the matching rule for a file in the validation structure.
 * Rules are checked in priority order: literal filenames, pattern rules, then wildcard.
 * @param fileName The file name to match.
 * @param rules The rules object from the validation structure.
 * @returns The matching rule or undefined if no rule matches.
 */
function findMatchingRule(fileName, rules) {
	if (!rules) {
		return;
	}

	// Priority 1: exact filename match (e.g., "LICENSE", "README.md")
	if (fileName in rules) {
		return rules[fileName];
	}

	// Priority 2: glob pattern match (e.g., "*.ts", "I[A-Z]*.ts")
	for (const [pattern, ruleValue] of Object.entries(rules)) {
		if (pattern !== '*' && pattern !== '') {
			const regexPattern = pattern.replace(/\*/g, '.*');
			if (new RegExp(`^${regexPattern}$`).test(fileName)) {
				return ruleValue;
			}
		}
	}

	// Priority 3: wildcard fallback
	return rules['*'];
}

/**
 * Extract file rules for the current directory and rules that propagate to children.
 * Rules starting with double star-slash are added to both local and propagated sets.
 * Other rules stay local only. Directory rules with double star-slash are excluded.
 * @param rules The raw directory rules object.
 * @returns Local file rules and child-propagated file rules.
 * @throws Error if a rule value is invalid.
 */
function extractFileRules(rules) {
	const localFileRules = {};
	const childPropagatedRules = {};

	if (!rules || typeof rules !== 'object') {
		return { localFileRules, childPropagatedRules };
	}

	for (const [pattern, value] of Object.entries(rules)) {
		// Skip directory rules and empty patterns
		if (pattern === '**/' || pattern === '') {
			// skip directory rule or empty pattern
		} else if (
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value) &&
			!('case' in value)
		) {
			// Skip nested configuration objects (directories) - they're not file rules
		} else {
			// Validate and process file rule
			if (!isValidRule(value)) {
				throw new Error(`Invalid rule for pattern '${pattern}': ${JSON.stringify(value)}`);
			}

			if (pattern.startsWith('**/')) {
				const localPattern = pattern.slice(3);
				if (localPattern) {
					localFileRules[localPattern] = value;
					childPropagatedRules[localPattern] = value;
				}
			} else {
				localFileRules[pattern] = value;
			}
		}
	}

	return { localFileRules, childPropagatedRules };
}

/**
 * Extract directory naming rules.
 * @param rules The raw directory rules object.
 * @returns Local child directory rule and child-propagated directory rule.
 * @throws Error if the directory rule is invalid.
 */
function extractDirectoryRules(rules) {
	if (!rules || typeof rules !== 'object') {
		return {};
	}

	const directoryRuleValue = rules['**/'];
	if (directoryRuleValue !== undefined && !isValidRule(directoryRuleValue)) {
		throw new Error(`Invalid directory rule for '**/': ${JSON.stringify(directoryRuleValue)}`);
	}

	const localDirectoryRule = normalizeRule(directoryRuleValue)?.case;
	return { localDirectoryRule, childPropagatedDirectoryRule: localDirectoryRule };
}

/**
 * Load and validate the repository structure configuration, then walk the directory tree.
 */
function processRepoStructure(context, node, rootDir = process.cwd()) {
	const configPath = path.join(rootDir, 'repo-structure.json');
	let rawConfig;

	try {
		rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
	} catch {
		context.report({
			node,
			messageId: 'missingConfig',
			data: { path: configPath }
		});
		return;
	}

	if (!rawConfig.structure) {
		context.report({
			node,
			messageId: 'missingStructure'
		});
		return;
	}

	walkDirectory(context, rootDir, rawConfig.structure, rootDir, rawConfig.ignorePatterns);
}

/**
 * Normalize a path to use forward slashes.
 * @param pathStr The path to normalize.
 * @returns The normalized path.
 */
function normalizePath(pathStr) {
	return pathStr.replace(/\\/g, '/');
}

/**
 * Escape a character that has special meaning in regex.
 * @param char The character to escape.
 * @returns The escaped character, or the original if not special.
 */
function escapeRegexCharacter(char) {
	const specialChars = '$()*+.?[\\]^{|}';
	return specialChars.includes(char) ? `\\${char}` : char;
}

/**
 * Convert a glob-like pattern to a regular expression.
 * Supports '**' (matches anything including /) and '*' (matches anything except /).
 * @param pattern The glob-like pattern.
 * @returns A regular expression matching the pattern.
 */
function globToRegex(pattern) {
	let regex = '^';

	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		const nextChar = pattern[i + 1];

		if (char === '*' && nextChar === '*') {
			regex += '.*';
			i++; // Skip next '*'
		} else if (char === '*') {
			regex += '[^/]*';
		} else {
			regex += escapeRegexCharacter(char);
		}
	}

	return new RegExp(`${regex}$`);
}

/**
 * Strip ignored segments from a filename before case validation.
 * E.g. stripIgnoredSegments('foo.spec.ts', ['spec']) returns 'foo.ts'.
 * @param fileName The original file name.
 * @param ignoreSegments Segments to remove from dot-separated name parts.
 * @returns The file name with ignored segments removed, or the original if none to remove.
 */
function stripIgnoredSegments(fileName, ignoreSegments) {
	if (!ignoreSegments?.length) {
		return fileName;
	}

	const ext = path.extname(fileName);
	const stem = path.basename(fileName, ext);
	const filtered = stem.split('.').filter(segment => !ignoreSegments.includes(segment));
	return `${filtered.join('.')}${ext}`;
}

/**
 * Check if a name should be ignored based on ignore patterns.
 * Patterns with '/' match against relative path, others match against filename only.
 * @param name The file or directory name.
 * @param relativePath The relative path from root.
 * @param ignorePatterns Array of glob patterns to match against.
 * @returns True if the name matches any ignore pattern.
 */
function shouldIgnore(name, relativePath, ignorePatterns) {
	if (!ignorePatterns?.length) {
		return false;
	}

	const normalizedPath = normalizePath(relativePath);

	return ignorePatterns.some(pattern => {
		const normalizedPattern = normalizePath(pattern);
		const matcher = globToRegex(normalizedPattern);
		// If pattern contains '/', match against full relative path; otherwise match filename only
		return normalizedPattern.includes('/') ? matcher.test(normalizedPath) : matcher.test(name);
	});
}

/**
 * Get the configuration rules for a specific directory path.
 * Traverses the config tree using exact keys (e.g. '/packages'), pipe-delimited multi-keys
 * (e.g. '/packages|/apps'), or glob keys matching any directory at any depth.
 * Returns undefined if path not configured.
 * @param dirPath Directory path relative to root.
 * @param config The configuration object.
 * @returns The rules object for this directory, or undefined if not configured.
 */
function getDirectoryRules(dirPath, config) {
	const parts = dirPath === '.' ? [] : dirPath.split('/');
	let current = config['.'];

	for (let i = 0; i < parts.length; i++) {
		if (!current || typeof current !== 'object') {
			return;
		}

		const part = parts[i];
		const exactKey = `/${part}`;

		// Priority 1: exact key or pipe-delimited multi-key
		const matchingKey = Object.keys(current).find(
			k => typeof current[k] === 'object' && k.split('|').includes(exactKey)
		);
		if (matchingKey) {
			current = current[matchingKey];
		} else {
			// Priority 2: glob key
			const globKey = `**/${part}`;
			if (current[globKey] && typeof current[globKey] === 'object') {
				current = current[globKey];
			} else {
				// Priority 3: check if glob patterns can skip this segment
				const hasGlobObjectKeys = Object.keys(current).some(
					k => k.startsWith('**/') && k !== '**/' && typeof current[k] === 'object'
				);
				if (!hasGlobObjectKeys) {
					return;
				}
				// else: glob pattern match found, continue to next iteration
			}
		}
	}

	return current;
}

/**
 * Recursively walk through directories and validate file and folder naming.
 * Merges inherited rules with directory-specific rules, propagates rules to children.
 */
function walkDirectory(
	context,
	currentPath,
	validateStructure,
	rootDir,
	ignorePatterns,
	inheritedRules = {},
	inheritedDirectoryRule
) {
	const relativePath = normalizePath(path.relative(rootDir, currentPath)) || '.';

	// Get rules configured for this directory level
	const directoryRules = getDirectoryRules(relativePath, validateStructure);
	const { localFileRules, childPropagatedRules } = extractFileRules(directoryRules);
	const { localDirectoryRule, childPropagatedDirectoryRule } =
		extractDirectoryRules(directoryRules);

	// Merge inherited rules with local rules for this directory
	const rules = { ...inheritedRules, ...localFileRules };
	const nextInheritedRules = { ...inheritedRules, ...childPropagatedRules };
	const directoryRule = localDirectoryRule ?? inheritedDirectoryRule;
	const nextInheritedDirectoryRule = childPropagatedDirectoryRule ?? directoryRule;

	// Early exit if no rules apply and no descendant rules configured
	if (Object.keys(rules).length === 0 && !directoryRule && !directoryRules) {
		return;
	}

	const entries = fs.readdirSync(currentPath, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(currentPath, entry.name);
		const relativeEntryPath = normalizePath(path.relative(rootDir, fullPath));

		// Process entry if not ignored
		if (!shouldIgnore(entry.name, relativeEntryPath, ignorePatterns)) {
			const relativeDirPath = normalizePath(path.relative(rootDir, fullPath));

			if (entry.isDirectory()) {
				const childDirectoryRules = getDirectoryRules(relativeDirPath, validateStructure);
				const hasExplicitEntry = childDirectoryRules !== undefined;

				// Validate directory name only if no explicit config entry overrides it
				if (!hasExplicitEntry && directoryRule && !matchesCase(entry.name, directoryRule)) {
					context.report({
						node: context.sourceCode.ast,
						messageId: 'invalidName',
						data: {
							kind: 'Directory',
							path: normalizePath(fullPath),
							caseName: directoryRule,
							expected: getExpectedName(entry.name, directoryRule)
						}
					});
				} else if (!hasExplicitEntry && !directoryRule) {
					context.report({
						node: context.sourceCode.ast,
						messageId: 'missingRule',
						data: {
							kind: 'Directory',
							path: normalizePath(fullPath)
						}
					});
				}

				// Recurse into directory if it has configured rules or inherited rules can apply
				if (
					childDirectoryRules ||
					Object.keys(nextInheritedRules).length > 0 ||
					nextInheritedDirectoryRule
				) {
					walkDirectory(
						context,
						fullPath,
						validateStructure,
						rootDir,
						ignorePatterns,
						nextInheritedRules,
						nextInheritedDirectoryRule
					);
				}
			} else {
				// Validate file naming against matching rules
				const fileRule = normalizeRule(findMatchingRule(entry.name, rules));
				if (fileRule) {
					if (fileRule.regex) {
						// Custom regex validation - apply to filename without extension
						const ext = path.extname(entry.name);
						const stem = path.basename(entry.name, ext);
						if (!new RegExp(fileRule.regex).test(stem)) {
							context.report({
								node: context.sourceCode.ast,
								messageId: 'invalidName',
								data: {
									kind: 'File',
									path: normalizePath(fullPath),
									caseName: 'regex pattern',
									expected: fileRule.regex
								}
							});
						}
					} else if (fileRule.case) {
						// Standard case validation
						const { case: caseType, ignoreSegments } = fileRule;
						const nameToValidate = stripIgnoredSegments(entry.name, ignoreSegments);
						if (!matchesCase(nameToValidate, caseType)) {
							context.report({
								node: context.sourceCode.ast,
								messageId: 'invalidName',
								data: {
									kind: 'File',
									path: normalizePath(fullPath),
									caseName: caseType,
									expected: getExpectedName(nameToValidate, caseType)
								}
							});
						}
					}
				} else {
					context.report({
						node: context.sourceCode.ast,
						messageId: 'missingRule',
						data: {
							kind: 'File',
							path: normalizePath(fullPath)
						}
					});
				}
			}
		}
	}
}

/**
 * ESLint rule implementation for validating repository file and folder naming.
 */
const validateRepoStructureRule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Validate all file and folder naming in the repository using repo-structure.json.'
		},
		schema: [],
		messages: {
			missingConfig: "Missing repo-structure.json at '{{path}}'.",
			invalidName: "{{kind}} '{{path}}' does not match '{{caseName}}' case. Use '{{expected}}'.",
			missingRule: "{{kind}} '{{path}}' has no matching naming rule in repo-structure.json.",
			missingStructure: "repo-structure.json is missing a top-level 'structure' object."
		}
	},
	create(context) {
		const rootDir = process.cwd();
		return {
			Program(node) {
				processRepoStructure(context, node, rootDir);
			}
		};
	}
};

/**
 * ESLint plugin exposing the repository structure validation rule.
 */
export const repoStructurePlugin = {
	rules: {
		'validate-repo-structure': validateRepoStructureRule
	}
};
