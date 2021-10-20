// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as fs from 'fs';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('bazel.sync', () => {
		let options: vscode.InputBoxOptions = {
			prompt: "Bazel target: ",
			placeHolder: "//target:all",
		};

		const COMPILE_COMMAND_REGEX = /\(cd\s(.*)\s\&.*\n((.|\n)*)(\/usr\/bin\/gcc.*)\)/g;
		const SUBCOMMAND_REGEX = /SUBCOMMAND\:.*/g;
		const COMPILE_COMMAND_SOURCE_OUTPUT_REGEX = /.*\-c\s(.*)\-o\s(.*)$/g;

		const workspace = vscode.workspace.getConfiguration('bazel');
		const destinationFolder: string = workspace.get('workspace', '');

		if (destinationFolder === '') {
			vscode.window.showErrorMessage("No workspace folder provided.");
			return;
		}

		let bazelLog = vscode.window.createOutputChannel("Bazel Sync");

		vscode.window.showInputBox(options).then(value => {
			bazelLog.show();
			bazelLog.appendLine(`Syncing Bazel Target ${value} :) This might take some time`);

			let child = child_process.spawn('bazel', ['build', `--action_env="some_variable=${Math.floor(+new Date() / 1000)}"`, '-s', `${value}`], {cwd: destinationFolder});
			let fullOutput = '';

			child.stdout.setEncoding('utf8');
			child.stdout.on('data', (data) => {
				bazelLog.append(data.toString());
				fullOutput += data.toString();
			});

			child.stdout.setEncoding('utf8');
			child.stderr.on('data', (data) => {
				bazelLog.append(data.toString());
				fullOutput += data.toString();
			});

			interface DatabaseEntry {
				directory: string;
				command: string;
				file: string;
			};

			let compilationDatabase: Array<DatabaseEntry> = [];

			child.on('close', (code) => {
				vscode.window.withProgress({location: vscode.ProgressLocation.Notification}, async (progress) => {
					const potentialMatches = (fullOutput.split(SUBCOMMAND_REGEX));

					let m;
					potentialMatches.forEach((potentialMatch, index) => {
						progress.report({message: `Creating compilation database ${index}/${potentialMatches.length}`});

						while ((m = COMPILE_COMMAND_REGEX.exec(potentialMatch))) {
							if (m.index === COMPILE_COMMAND_REGEX.lastIndex) {
								COMPILE_COMMAND_REGEX.lastIndex++;
							}

							const location = m[1];
							const compileCommand = m[4];

							let sourceOutput;
							if (sourceOutput = COMPILE_COMMAND_SOURCE_OUTPUT_REGEX.exec(compileCommand)) {
								compilationDatabase.push({
									"directory": location,
									"command": compileCommand,
									"file": sourceOutput[1],
								});
							}
						}
					});
				});

				try {
					const data = fs.writeFileSync(path.join(destinationFolder, 'compile_commands.json'), JSON.stringify(compilationDatabase));
				} catch (err) {
					vscode.window.showErrorMessage("Something went wrong ;)");
					return;
				}

				const clangdExtension = vscode.extensions.getExtension('llvm-vs-code-extensions.vscode-clangd');

				if (!clangdExtension?.isActive) {
					clangdExtension?.activate().then(
						() => {
							vscode.window.showInformationMessage('Activating clangd language server.');
							vscode.commands.executeCommand('clangd.restart');
						},
						() => vscode.window.showErrorMessage("Could not restart clangd language server.")
					);
				} else {
					vscode.commands.executeCommand('clangd.restart');
				}
			});
		});
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
