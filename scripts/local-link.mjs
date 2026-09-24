// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
/**
 * This script is used to link local instances of packages in node_modules
 * without using package manager commands. When using the <package-name> option,
 * the script will try to find the package in the sibling folders and link it.
 *
 * It supports both the hoisted layout used by npm, where the package is
 * installed once in the root node_modules, and the isolated layout used by
 * pnpm, where each workspace package has its own node_modules containing
 * symbolic links into the store.
 *
 * You can use wildcards to link multiple packages with similar names.
 *    pnpm run local-link "@twin.org/engine*"
 * or to link all packages in the current repo
 *    pnpm run local-link "@twin.org//*"
 *
 * Usage:
 *    pnpm run local-link <package-name>
 * or
 *    pnpm run local-link /path/to/package
 *
 * To unlink
 *    pnpm run local-link <package-name> unlink
 * or
 *    pnpm run local-link /path/to/package unlink
 *
 * Always unlink before running an install, as the package manager will
 * overwrite the links and leave the backups orphaned.
 */
import fs, { readdir } from 'node:fs/promises';
import path from 'node:path';
import { directoryExists, fileExists, isSymbolicLink, loadJson } from './common.mjs';

/**
 * Execute the process.
 */
async function run() {
	process.stdout.write('🔗 Local Link\n');
	process.stdout.write('\n');
	process.stdout.write(`💻 Platform: ${process.platform}\n`);

	if (process.argv.length <= 2) {
		throw new Error('No target package specified');
	}

	const targetPackage = process.argv[2];

	const isUnlink = process.argv[3] === 'unlink';
	process.stdout.write(`${isUnlink ? '↩️ ' : '🔧'} Mode:     ${isUnlink ? 'unlink' : 'link'}\n`);
	process.stdout.write(`🎯 Target:   ${targetPackage}\n`);

	// The target package starts with an @ so we have to try and locate it by
	// looking in the parent folder and assuming the other repos are in
	// a sibling folder to this one
	const packages = await findPackagesDetails(targetPackage);

	const nodeModulesDirs = await findNodeModulesDirs(path.resolve('.'));

	process.stdout.write(`\n📦 Matched packages: ${packages.length}\n`);
	for (const pkg of packages) {
		process.stdout.write(`   • ${pkg.packageName}\n`);
	}

	process.stdout.write(`\n📂 Local node modules locations: ${nodeModulesDirs.length}\n`);
	for (const nodeModulesDir of nodeModulesDirs) {
		process.stdout.write(`   • ${relativeToHere(nodeModulesDir)}\n`);
	}

	let changed = 0;

	for (const [index, pkg] of packages.entries()) {
		const position = `[${index + 1}/${packages.length}]`;

		if (isUnlink) {
			process.stdout.write(`\n${position} ${pkg.packageName}\n`);
			changed += await unlinkPackage(nodeModulesDirs, pkg.packageName);
		} else {
			process.stdout.write(`\n${position} ${pkg.packageName}\n   => ${pkg.targetDir}\n`);
			changed += await linkPackage(nodeModulesDirs, pkg.packageName, pkg.targetDir);
		}
	}

	const action = isUnlink ? 'Unlinked' : 'Linked';
	process.stdout.write(
		`\n🎉 Done. ${action} ${changed} location${changed === 1 ? '' : 's'} across ${packages.length} package${packages.length === 1 ? '' : 's'}.\n`
	);
}

/**
 * Shorten a path so it reads relative to the repository being worked in.
 * @param target The path to shorten.
 * @returns The path relative to the current repository.
 */
function relativeToHere(target) {
	const relative = path.relative(path.resolve('.'), target);
	return relative.length === 0 ? '.' : relative;
}

/**
 * Link the specified package in every node_modules which contains it.
 * @param nodeModulesDirs The node_modules directories to link in.
 * @param packageName The name of the package to link.
 * @param targetDir The target directory of the package to link.
 * @returns How many locations were linked.
 */
async function linkPackage(nodeModulesDirs, packageName, targetDir) {
	let foundCount = 0;
	let linkCount = 0;

	for (const nodeModulesDir of nodeModulesDirs) {
		const currentNodeDir = path.join(nodeModulesDir, packageName);
		const location = relativeToHere(currentNodeDir);

		// Only proceed if the package is installed in this node_modules
		if (await entryExists(currentNodeDir)) {
			foundCount++;

			if (await isLinkedTo(currentNodeDir, targetDir)) {
				process.stdout.write(`   ⏭️  already linked  ${location}\n`);
			} else {
				// The backup retains whatever was installed, a real directory when the
				// packages are hoisted, or a symbolic link into the store when they are not
				const backupNodeDir = `${currentNodeDir}.bak`;
				await removeEntry(backupNodeDir);
				await fs.rename(currentNodeDir, backupNodeDir);
				await fs.symlink(targetDir, currentNodeDir);

				linkCount++;
				process.stdout.write(`   ✅ linked          ${location}\n`);
			}
		}
	}

	if (foundCount === 0) {
		process.stdout.write('   ⚠️  not installed in any of the locations, skipping\n');
	} else {
		process.stdout.write(`   ↳  linked ${linkCount} of ${foundCount} installed location(s)\n`);
	}

	return linkCount;
}

/**
 * Unlink the specified package in every node_modules which contains a backup.
 * @param nodeModulesDirs The node_modules directories to unlink in.
 * @param packageName The name of the package to unlink.
 * @returns How many locations were unlinked.
 */
async function unlinkPackage(nodeModulesDirs, packageName) {
	let unlinkCount = 0;

	for (const nodeModulesDir of nodeModulesDirs) {
		const linkName = path.join(nodeModulesDir, packageName);
		const linkNameBackup = `${linkName}.bak`;
		const location = relativeToHere(linkName);

		// Only proceed if there is a backup to restore
		if (await entryExists(linkNameBackup)) {
			const linkExists = await entryExists(linkName);

			if (linkExists && !(await isSymbolicLink(linkName))) {
				process.stdout.write(`   ⚠️  not a symbolic link, skipping  ${location}\n`);
			} else {
				if (linkExists) {
					await fs.unlink(linkName);
				}
				await fs.rename(linkNameBackup, linkName);

				unlinkCount++;
				process.stdout.write(`   ↩️  unlinked        ${location}\n`);
			}
		}
	}

	if (unlinkCount === 0) {
		process.stdout.write('   ⚠️  not linked in any of the locations, skipping\n');
	} else {
		process.stdout.write(`   ↳  unlinked ${unlinkCount} location(s)\n`);
	}

	return unlinkCount;
}

/**
 * Find the node_modules directories which could contain the package to link.
 * npm hoists the packages to the root node_modules, pnpm gives each workspace
 * package its own node_modules.
 * @param searchDir The directory to search from.
 * @param depth How many levels below the search directory to look.
 * @returns The node_modules directories.
 */
async function findNodeModulesDirs(searchDir, depth = 2) {
	const nodeModulesDirs = [];

	const nodeModulesDir = path.join(searchDir, 'node_modules');
	if (await directoryExists(nodeModulesDir)) {
		nodeModulesDirs.push(nodeModulesDir);
	}

	if (depth > 0) {
		const entries = await readdir(searchDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
				const childDirs = await findNodeModulesDirs(path.join(searchDir, entry.name), depth - 1);
				nodeModulesDirs.push(...childDirs);
			}
		}
	}

	return nodeModulesDirs;
}

/**
 * Does the entry exist, this includes symbolic links with a missing target.
 * @param entry The entry to check for existence.
 * @returns True if the entry exists.
 */
async function entryExists(entry) {
	try {
		await fs.lstat(entry);
		return true;
	} catch {
		return false;
	}
}

/**
 * Is the entry a symbolic link which already resolves to the target directory.
 * @param entry The entry to check.
 * @param targetDir The target directory the entry should resolve to.
 * @returns True if the entry is already linked to the target directory.
 */
async function isLinkedTo(entry, targetDir) {
	if (!(await isSymbolicLink(entry))) {
		return false;
	}

	try {
		return (await fs.realpath(entry)) === (await fs.realpath(targetDir));
	} catch {
		return false;
	}
}

/**
 * Remove an entry whether it is a symbolic link or a real directory.
 * @param entry The entry to remove.
 */
async function removeEntry(entry) {
	if (await isSymbolicLink(entry)) {
		await fs.unlink(entry);
	} else if (await directoryExists(entry)) {
		await fs.rm(entry, { recursive: true });
	}
}

/**
 * Find the package directories in a repository by looking at the folders on disk.
 * Asking pnpm for the workspace projects is authoritative, but it starts a process
 * for every repository and installs the dependencies when they are missing, which
 * is far too slow when every sibling repository is being searched.
 * @param repoRoot The root directory of the repository.
 * @returns The package directories relative to the root.
 */
async function findPackageDirs(repoRoot) {
	const packageDirs = [];

	for (const parent of ['packages', 'apps']) {
		const parentDir = path.join(repoRoot, parent);

		// A repository does not have to contain both of the parent folders.
		if (await directoryExists(parentDir)) {
			for (const entry of await readdir(parentDir, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					const packageDir = `${parent}/${entry.name}`;
					if (await fileExists(path.join(repoRoot, packageDir, 'package.json'))) {
						packageDirs.push(packageDir);
					}
				}
			}
		}
	}

	return packageDirs;
}

/**
 * Find the package directory and name.
 * @param targetPackage The target package to find.
 * @returns The package directory and name.
 */
async function findPackagesDetails(targetPackage) {
	const packages = [];

	if (targetPackage.startsWith('@')) {
		const repoDirRoot = path.resolve('..');
		process.stdout.write(`🔍 Search:   ${repoDirRoot}\n`);

		const targetPackageParts = targetPackage.split('/');
		const packageNameOnly = targetPackageParts[1];

		const allRepoDirs = await readdir(repoDirRoot, { withFileTypes: true });
		for (const repoDir of allRepoDirs) {
			if (repoDir.isDirectory()) {
				const repoRoot = path.join(repoDirRoot, repoDir.name);
				if (await fileExists(path.join(repoRoot, 'package.json'))) {
					for (const workspaceEntry of await findPackageDirs(repoRoot)) {
						const entryParts = workspaceEntry.split('/');
						if (new RegExp(`^${packageNameOnly}`).test(entryParts[1])) {
							const targetDir = path.join(repoRoot, workspaceEntry);
							packages.push({ packageName: await getPackageNameFromDir(targetDir), targetDir });
						}
					}
				}
			}
		}
	} else {
		const targetDir = path.resolve(targetPackage);
		packages.push({ packageName: await getPackageNameFromDir(targetDir), targetDir });
	}

	return packages;
}

/**
 * Get the package name from the directory.
 * @param targetDir The target directory.
 * @returns The package name.
 */
async function getPackageNameFromDir(targetDir) {
	const repoPackageJsonFilename = path.join(targetDir, 'package.json');
	if (await fileExists(repoPackageJsonFilename)) {
		const repoPackageJson = await loadJson(repoPackageJsonFilename);
		return repoPackageJson.name;
	}
	throw new Error(`Unable to locate package.json in target directory: ${targetDir}`);
}

run().catch(err => {
	process.stderr.write(`${err}\n`);
	// eslint-disable-next-line unicorn/no-process-exit
	process.exit(1);
});
