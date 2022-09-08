import * as os from 'os';
import { workspace, ExtensionContext, window, commands } from 'vscode';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';
import { promisify } from 'util';
import { execFile } from 'child_process';

let client: LanguageClient;

const outputChannel = window.createOutputChannel('Wasp Language Server');

export async function activate(context: ExtensionContext) {
  console.log('..Extension "vscode-wasp" is now active..');

  // Configuration name and properties are set in package.json
  const config = workspace.getConfiguration('wasp');

  const executablePath = resolveWaspExecutablePath(config.server.executable);

  // Check if the path points to a valid wasp executable
  const executableStatus = await checkWaspExecutable(executablePath);

  if (executableStatus !== Status.Available) {
    if (executableStatus === Status.Timedout) {
      window.showInformationMessage(`The wasp server process has timed out.`);
    } else {
      if (executablePath === 'wasp') {
        window.showErrorMessage('No `wasp` executable is available in the VSCode PATH.');
        return;
      } else {
        window.showInformationMessage(`The user defined executable path couldn't be run: [${executablePath}].`);
      }
    }
  }

  // TODO: send these settings to wasp language server so it can update its logging output if
  // these are changed while the language server is running
  const useOutputPanel = config.server.useOutputPanelForLogging;
  const logFile = useOutputPanel ? "[OUTPUT]" : config.server.logFile;
  const logFileOpt = logFile.trim() === '' ? [] : ['--log=' + logFile];

  // Configure vscode-languageclient
  let runArgs = ['waspls', ...logFileOpt];
  let debugArgs = ['waspls', ...logFileOpt];

  let serverOptions: ServerOptions = {
    run: {
      command: executablePath,
      transport: TransportKind.stdio,
      args: runArgs,
    },
    debug: {
      command: executablePath,
      transport: TransportKind.stdio,
      args: debugArgs,
    }
  };

  let clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'wasp' }],
    initializationOptions: { 'vscode-wasp': workspace.getConfiguration('vscode-wasp') },
    outputChannel: outputChannel
  };

  client = new LanguageClient(
    'vscode-wasp',
    'VSCode Wasp',
    serverOptions,
    clientOptions,
  );

  client.start();
  outputChannel.appendLine('..Wasp LSP Server has been started..');

  // Register command to restart wasp language server.
  context.subscriptions.push(commands.registerCommand('vscode-wasp.restartLanguageServer', async () => {
    if (client) {
      try {
        console.log(`..Restarting Wasp LSP Server..`);
        await client.restart();
        console.log(`..Wasp LSP Server has been restarted..`);
      } catch (err) {
        outputChannel.appendLine(`Couldn't restart Wasp LSP Server: ${err.message}`);
      }
    }
  }));
}

export function deactivate() {
  if (client) {
    client.stop();
  }
}

// For a given user defined wasp executable path with possibly vs-code specific path variables,
// returns interpolated executable path that can then be normally used.
// If no path is given, it returns default path to wasp executable.
function resolveWaspExecutablePath(userDefinedWaspExecutablePath: string): string {
  if (!userDefinedWaspExecutablePath) return 'wasp';
  console.log(`Trying to find the server executable in ${userDefinedWaspExecutablePath}`);
  let resolvedPath = interpolateVSCodeSpecificExecutablePath(userDefinedWaspExecutablePath)
  console.log(`Location after path variables subsitution: ${resolvedPath}`);
  return resolvedPath;
}

// Given a path to executable that contains common vscode-specific path variables,
// replaces those variables with proper values.
function interpolateVSCodeSpecificExecutablePath(executablePath: string): string {
    // Interpolate in values for common vscode path variables

    // Path variable for home directory
    executablePath = executablePath
        .replace('${HOME}', os.homedir)
        .replace('${home}', os.homedir)
        .replace(/^~/, os.homedir);

    // Path variable for workspace folder
    let folders = workspace.workspaceFolders;
    if (folders) {
        let folder = folders[0];
        if (folder) {
            executablePath = executablePath
                .replace('${workspaceFolder}', folder.uri.path)
                .replace('${workspaceRoot}', folder.uri.path);
        }
    }

    return executablePath
}

// Runs the wasp executable in `version` mode and checks that it:
// - Exits successfuly
// - Exits within 1 second
//
// If it fails either of these checks, a status is returned to show that the
// executable path is not valid.
async function checkWaspExecutable(executablePath: string): Promise<Status> {
  const execPromise = promisify(execFile)
    (executablePath, ['version'], { timeout: 2000, windowsHide: true })
    .then(() => Status.Available).catch(_err => Status.Missing);

  const timeoutPromise = new Promise<Status>((resolve, _reject) => {
    let timer = setTimeout(() => {
      clearTimeout(timer);
      resolve(Status.Timedout);
    }, 1000);
  });

  return Promise.race([execPromise, timeoutPromise]);
}

// Executable status types
enum Status {
  Available = 'available',
  Missing = 'missing',
  Timedout = 'timedout',
}
